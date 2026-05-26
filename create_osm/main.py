#!/usr/bin/env python3
"""
main.py - Downloads OSM data for every patch in the Greece index using the
          selected backend (osmnx / postgis / osmium).

Outputs are written to:
    <project_root>/data/<backend>/osm_<i>/<image_stem>_<geom_type>.geojson

Run from any directory:
    python create_osm/main.py --backend osmnx
    python create_osm/main.py --backend postgis
    python create_osm/main.py --backend osmium
"""
import argparse
import csv
import glob
import logging
from pathlib import Path
import time

from download_osm import OSMDownloader

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[1]

INDEX_PATH = PROJECT_ROOT / "index_greece.csv"
DIST       = 1280
DRY_RUN    = False
LIMIT      = None

DSN = "dbname=osm_db user=postgres password=postgres host=localhost"

PBF_FILES = glob.glob(str(PROJECT_ROOT / "greece-*.osm.pbf"))
PBF_PATH  = PBF_FILES[0] if PBF_FILES else None

DATA_ROOT = PROJECT_ROOT / "data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download OSM data for Greece patches.")
    parser.add_argument(
        "--backend",
        choices=["osmnx", "postgis", "osmium"],
        default="postgis",
        help="OSM backend to use (default: postgis)",
    )
    return parser.parse_args()


def process_index(backend: str) -> None:
    if not INDEX_PATH.exists():
        raise FileNotFoundError(f"Index file not found: {INDEX_PATH}")

    if backend == "osmium" and not PBF_PATH:
        raise FileNotFoundError(
            "No greece-*.osm.pbf file found inside the project root. "
            "Download it from https://download.geofabrik.de/europe/greece.html "
            "and place it in the project root."
        )

    conn = None
    if backend == "postgis":
        import psycopg2
        conn = psycopg2.connect(DSN)
        logger.info("Connected to PostGIS database")

    start = time.perf_counter()
    try:
        with INDEX_PATH.open("r", newline="") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if LIMIT is not None and i >= LIMIT:
                    break

                fn  = row.get("fn") or row.get("filename")
                lon = row.get("lon")
                lat = row.get("lat")

                if lat is None or lon is None:
                    logger.warning(f"Skipping row {i} — missing lat/lon: {row}")
                    continue

                try:
                    lat_f = float(lat)
                    lon_f = float(lon)
                except ValueError:
                    logger.warning(f"Invalid lat/lon on row {i}: {lat},{lon}")
                    continue

                out_dir = DATA_ROOT / backend / f"osm_{i}"

                if out_dir.exists() and any(out_dir.iterdir()):
                    logger.info(f"[{i}] Already exists, skipping.")
                    continue

                out_dir.mkdir(parents=True, exist_ok=True)

                image_stem  = Path(fn).stem if fn else f"patch_{i}"
                output_base = out_dir / image_stem

                logger.info(f"[{i}] ({lat_f:.4f},{lon_f:.4f}) -> {out_dir} dist={DIST}m")

                if DRY_RUN:
                    continue

                downloader = OSMDownloader(
                    lat=lat_f,
                    lon=lon_f,
                    dist=DIST,
                    output_file=str(output_base),
                    image_stem=image_stem,
                    backend=backend,
                    db_conn=conn,
                    pbf_path=PBF_PATH,
                )

                try:
                    downloader()
                except Exception as e:
                    if backend == "osmnx" and "InsufficientResponseError" in type(e).__name__:
                        logger.warning(f"[{i}] No features at ({lat_f},{lon_f}) — skipping")
                    else:
                        logger.exception(f"Failed row {i} ({lat_f},{lon_f}): {e}")
                finally:
                    if out_dir.exists() and not any(out_dir.iterdir()):
                        out_dir.rmdir()
                        logger.info(f"[{i}] Removed empty folder {out_dir}")

    finally:
        if conn is not None:
            conn.close()
            logger.info("Closed PostGIS connection")
        elapsed = time.perf_counter() - start
        logger.info(f"TOTAL PIPELINE TIME: {elapsed:.2f}s")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()
    process_index(backend=args.backend)