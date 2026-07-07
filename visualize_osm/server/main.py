#!/usr/bin/env python3
"""
server/main.py - Serve the map shell and frontend API data.

Run standalone:
    python server/main.py

Or import and call serve() from the top-level main.py.
"""
import sys
import json
import math
import os
import pickle
import threading
from functools import lru_cache
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Ensure visualize_osm/ is on sys.path when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from config import (
    PROJECT_ROOT,
    BACKEND_LIST,
    BACKEND_COLORS,
    DEFAULT_BACKEND,
    ICON_COLORS,
)
from app.data import load_patches, build_all_meta, get_feature_geojson_path

PORT = 8000
FEATURE_PREPARED_CACHE_VERSION = 1
FEATURE_PREPARED_CACHE_SUFFIX = ".prepared.pkl"
MAP_HTML_URL = "/visualize_osm/patches_map.html"

_SINGLEFLIGHT_GUARD = threading.Lock()
_SINGLEFLIGHT_LOCKS: dict[tuple, threading.Lock] = {}


def singleflight_lock(*key) -> threading.Lock:
    with _SINGLEFLIGHT_GUARD:
        lock = _SINGLEFLIGHT_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _SINGLEFLIGHT_LOCKS[key] = lock
        return lock


def get_api_state() -> tuple[list[tuple[int, str, float, float]], dict]:
    return _get_api_state_cached()


@lru_cache(maxsize=1)
def _get_api_state_cached() -> tuple[list[tuple[int, str, float, float]], dict]:
    patches = load_patches()
    return patches, build_all_meta(patches)


def build_lazy_markers(patches: list[tuple[int, str, float, float]], all_meta: dict) -> dict:
    lazy_markers = {}
    for bi, backend in enumerate(BACKEND_LIST):
        markers = []
        for i, _fn, lon, lat in patches:
            if str(i) not in all_meta.get(backend, {}):
                continue
            markers.append({
                "lat": lat,
                "lon": lon,
                "patch_id": str(i),
                "color": ICON_COLORS[bi % len(ICON_COLORS)],
            })
        lazy_markers[backend] = markers
    return lazy_markers


def feature_id_key(backend: str) -> str:
    if backend == "osmium":
        return "@id"
    if backend == "postgis":
        return "osm_id"
    return "id"


def normalize_feature_id(value) -> str:
    text = str(value or "").lower()
    if len(text) > 1 and text[0] in "rwn" and text[1:].isdigit():
        return text[1:]
    return text


def extend_lonlat_extent(coords, extent: list[float]) -> list[float]:
    if not coords:
        return extent
    if isinstance(coords[0], (int, float)):
        lon, lat = float(coords[0]), float(coords[1])
        extent[0] = min(extent[0], lon)
        extent[1] = min(extent[1], lat)
        extent[2] = max(extent[2], lon)
        extent[3] = max(extent[3], lat)
        return extent
    for child in coords:
        extend_lonlat_extent(child, extent)
    return extent


def geometry_lonlat_extent(geometry: dict | None) -> list[float] | None:
    if not geometry:
        return None
    extent = [math.inf, math.inf, -math.inf, -math.inf]
    if geometry.get("type") == "GeometryCollection":
        for child in geometry.get("geometries") or []:
            child_extent = geometry_lonlat_extent(child)
            if not child_extent:
                continue
            extent[0] = min(extent[0], child_extent[0])
            extent[1] = min(extent[1], child_extent[1])
            extent[2] = max(extent[2], child_extent[2])
            extent[3] = max(extent[3], child_extent[3])
    else:
        extend_lonlat_extent(geometry.get("coordinates"), extent)
    return extent if math.isfinite(extent[0]) else None


def prepared_feature_cache_path(geojson_path: Path) -> Path:
    return geojson_path.with_name(geojson_path.name + FEATURE_PREPARED_CACHE_SUFFIX)


def feature_source_signature(geojson_path: Path) -> dict:
    stat = geojson_path.stat()
    return {
        "source_size": stat.st_size,
        "source_mtime_ns": stat.st_mtime_ns,
    }


def prepared_feature_cache_is_valid(payload: dict, signature: dict) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("version") == FEATURE_PREPARED_CACHE_VERSION
        and payload.get("source_size") == signature["source_size"]
        and payload.get("source_mtime_ns") == signature["source_mtime_ns"]
        and isinstance(payload.get("features"), list)
    )


def load_prepared_patch_features(geojson_path: Path, signature: dict) -> list[dict] | None:
    cache_path = prepared_feature_cache_path(geojson_path)
    if not cache_path.exists():
        return None
    try:
        payload = pickle.loads(cache_path.read_bytes())
    except (OSError, pickle.PickleError, EOFError, AttributeError, TypeError, ValueError) as exc:
        print(f"[feature-cache] prepared-cache.read failed path={cache_path} reason={exc}", flush=True)
        return None
    if not prepared_feature_cache_is_valid(payload, signature):
        return None
    return payload["features"]


def write_prepared_patch_features(geojson_path: Path, signature: dict, features: list[dict]) -> None:
    cache_path = prepared_feature_cache_path(geojson_path)
    tmp_path = cache_path.with_name(f"{cache_path.name}.tmp.{os.getpid()}.{threading.get_ident()}")
    payload = {
        "version": FEATURE_PREPARED_CACHE_VERSION,
        **signature,
        "features": features,
    }
    try:
        tmp_path.write_bytes(pickle.dumps(payload, protocol=pickle.HIGHEST_PROTOCOL))
        tmp_path.replace(cache_path)
    except OSError as exc:
        print(f"[feature-cache] prepared-cache.write failed path={cache_path} reason={exc}", flush=True)
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def prepare_patch_features_from_geojson(geojson_path: Path) -> list[dict]:
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    features = []
    for feature in data.get("features") or []:
        extent = geometry_lonlat_extent(feature.get("geometry") or {})
        if extent:
            feature["_bbox"] = extent
            features.append(feature)
    return features


def load_or_prepare_patch_features(geojson_path: Path) -> list[dict]:
    signature = feature_source_signature(geojson_path)
    features = load_prepared_patch_features(geojson_path, signature)
    if features is not None:
        return features
    features = prepare_patch_features_from_geojson(geojson_path)
    write_prepared_patch_features(geojson_path, signature, features)
    return features


def load_patch_features(backend: str, patch_id: int) -> tuple[dict, list[dict]]:
    with singleflight_lock("load_patch_features", backend, patch_id):
        return _load_patch_features_cached(backend, patch_id)


@lru_cache(maxsize=128)
def _load_patch_features_cached(backend: str, patch_id: int) -> tuple[dict, list[dict]]:
    patches, all_meta = get_api_state()
    patch_lookup = {p[0]: p for p in patches}
    patch = patch_lookup.get(patch_id)
    if patch is None:
        raise FileNotFoundError("Patch not found")
    meta = all_meta.get(backend, {}).get(str(patch_id))
    if not meta or not meta.get("bbox"):
        raise FileNotFoundError("Patch metadata not found")
    geojson_path = get_feature_geojson_path(patch, backend)
    if geojson_path is None or not geojson_path.exists():
        raise FileNotFoundError("Feature data not found")
    return meta, load_or_prepare_patch_features(geojson_path)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            # Browsers commonly abort requests during refreshes/navigation.
            pass

    def send_json(self, payload, status: int = 200, content_type: str = "application/json"):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, status: int, message: str):
        self.send_json({"error": message}, status=status)

    def send_geojson_file(self, geojson_path: Path):
        body = geojson_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/geo+json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_api_get(self, parsed_url) -> bool:
        path = parsed_url.path
        if path == "/api/app-data":
            patches, all_meta = get_api_state()
            self.send_json({
                "all_meta": all_meta,
                "lazy_markers": build_lazy_markers(patches, all_meta),
                "backend_order": BACKEND_LIST,
                "backend_colors": BACKEND_COLORS,
                "default_backend": DEFAULT_BACKEND,
            })
            return True

        parts = path.strip("/").split("/")
        if (
            len(parts) == 5
            and parts[0] == "api"
            and parts[1] == "backends"
            and parts[3] == "features"
            and parts[4] == "search"
        ):
            backend = parts[2]
            query = parse_qs(parsed_url.query)
            needle = normalize_feature_id((query.get("id") or [""])[0])
            if not needle:
                self.send_error_json(400, "Missing feature id")
                return True

            patches, all_meta = get_api_state()
            patch_lookup = {p[0]: p for p in patches}
            key = feature_id_key(backend)

            for patch_id in all_meta.get(backend, {}):
                patch = patch_lookup.get(int(patch_id))
                if patch is None:
                    continue
                geojson_path = get_feature_geojson_path(patch, backend)
                if geojson_path is None or not geojson_path.exists():
                    continue

                try:
                    _meta, features = load_patch_features(backend, int(patch_id))
                except (FileNotFoundError, json.JSONDecodeError, ValueError):
                    continue

                for feature_idx, feature in enumerate(features):
                    props = feature.get("properties") or {}
                    if normalize_feature_id(props.get(key)) == needle:
                        self.send_json({
                            "found": True,
                            "backend": backend,
                            "patch_id": patch_id,
                            "feature_idx": feature_idx,
                            "feature_id": props.get(key),
                            "meta": all_meta[backend][patch_id],
                            "feature": feature,
                        })
                        return True

            self.send_json({"found": False, "backend": backend, "feature_id": needle})
            return True

        if (
            len(parts) == 6
            and parts[0] == "api"
            and parts[1] == "backends"
            and parts[3] == "patches"
            and parts[5] == "features"
        ):
            backend = parts[2]
            try:
                patch_id = int(parts[4])
            except ValueError:
                self.send_error_json(400, "Invalid patch id")
                return True

            patches, _all_meta = get_api_state()
            patch_lookup = {p[0]: p for p in patches}
            patch = patch_lookup.get(patch_id)
            if patch is None:
                self.send_error_json(404, "Patch not found")
                return True

            geojson_path = get_feature_geojson_path(patch, backend)
            if geojson_path is None or not geojson_path.exists():
                self.send_error_json(404, "Feature data not found")
                return True

            self.send_geojson_file(geojson_path)
            return True

        return False

    def do_HEAD(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == "/":
            self.send_response(302)
            self.send_header("Location", MAP_HTML_URL)
            self.end_headers()
            return
        if parsed_url.path.startswith("/api/"):
            if not self.do_api_get(parsed_url):
                self.send_error_json(404, "API endpoint not found")
            return
        super().do_HEAD()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        if path.startswith("/api/"):
            if not self.do_api_get(parsed_url):
                self.send_error_json(404, "API endpoint not found")
            return
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", MAP_HTML_URL)
            self.end_headers()
            return
        super().do_GET()


def serve(port: int = PORT) -> None:
    """Start the HTTP server (blocks until interrupted)."""
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving {PROJECT_ROOT} at http://localhost:{port}")
    print(f"Open:   http://localhost:{port}{MAP_HTML_URL}")
    httpd.serve_forever()


if __name__ == "__main__":
    serve()
