"""
data.py — Reads the patch index CSV and builds per-backend GeoJSON metadata.
"""
import csv
import os
import sys
from pathlib import Path

from config import INDEX_PATH, BACKENDS, PROJECT_ROOT, DIST

sys.path.append('..')
from create_osm.find_patch_bbox import get_patch_bbox

# The HTTP server is rooted at PROJECT_ROOT, so relative URLs are from there
SERVER_ROOT = PROJECT_ROOT / 'visualize_osm'


def load_patches() -> list[tuple[int, str, float, float]]:
    """Return list of (index, filename, lon, lat) from the index CSV."""
    patches = []
    with INDEX_PATH.open("r") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            fn = row.get("fn") or row.get("filename")
            if not fn:
                continue
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
            except (ValueError, KeyError):
                continue
            patches.append((i, fn, lon, lat))
    return patches


def build_all_meta(patches: list) -> dict:
    """
    For each backend, map patch index -> {url, fn, lat, lon, bbox} for every
    patch whose *_features.geojson file exists on disk.
    """
    all_meta: dict = {}
    for backend, data_dir in BACKENDS.items():
        meta: dict = {}
        for i, fn, lon, lat in patches:
            out_dir    = data_dir / f"osm_{i}"
            image_stem = Path(fn).stem
            geojson    = out_dir / f"{image_stem}_features.geojson"
            if not geojson.exists():
                continue

            min_lon, min_lat, max_lon, max_lat, *_ = get_patch_bbox(lat, lon, DIST)

            # URL relative to SERVER_ROOT (served by expose_server.py)
            relative_path = os.path.relpath(geojson, SERVER_ROOT).replace(os.sep, "/")
            meta[str(i)] = {
                "url":  relative_path,
                "fn":   fn,
                "lat":  round(lat, 4),
                "lon":  round(lon, 4),
                "bbox": [min_lon, min_lat, max_lon, max_lat],
            }
        all_meta[backend] = meta
    return all_meta
