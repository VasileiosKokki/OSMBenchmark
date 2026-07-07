"""
data.py — Reads the patch index CSV and builds per-backend GeoJSON metadata.
"""
import csv
from pathlib import Path

from config import INDEX_PATH, BACKENDS, DIST

from create_osm.find_patch_bbox import get_patch_bbox


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


def get_feature_geojson_path(patch: tuple[int, str, float, float], backend: str) -> Path | None:
    """Return the backend GeoJSON path for a patch, if that backend exists."""
    data_dir = BACKENDS.get(backend)
    if data_dir is None:
        return None

    i, fn, _lon, _lat = patch
    image_stem = Path(fn).stem
    return data_dir / f"osm_{i}" / f"{image_stem}_features.geojson"


def build_all_meta(patches: list) -> dict:
    """
    For each backend, map patch index -> {url, fn, lat, lon, bbox} for every
    patch whose *_features.geojson file exists on disk.
    """
    all_meta: dict = {}
    for backend in BACKENDS:
        meta: dict = {}
        for i, fn, lon, lat in patches:
            geojson = get_feature_geojson_path((i, fn, lon, lat), backend)
            if not geojson.exists():
                continue

            min_lon, min_lat, max_lon, max_lat, *_ = get_patch_bbox(lat, lon, DIST)

            meta[str(i)] = {
                "url":  f"/api/backends/{backend}/patches/{i}/features",
                "fn":   fn,
                "lat":  round(lat, 4),
                "lon":  round(lon, 4),
                "bbox": [min_lon, min_lat, max_lon, max_lat],
            }
        all_meta[backend] = meta
    return all_meta
