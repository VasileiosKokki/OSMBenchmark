#!/usr/bin/env python3
"""
filter_csv_for_greece.py - Filter the SatCLIP dataset index to Greece only.

Expects:
    <project_root>/index.csv   (download from SatCLIP repo)

Writes:
    <project_root>/index_greece.csv

The Greece boundary .poly is downloaded from Geofabrik automatically on first run.

Run from any directory:
    python create_osm/filter_csv_for_greece.py
"""
import csv
import json
import urllib.request
from pathlib import Path
from shapely.geometry import Point, Polygon, MultiPolygon, mapping

PROJECT_ROOT    = Path(__file__).resolve().parents[1]
POLY_PATH       = PROJECT_ROOT / "greece.poly"
BOUNDARY_GEOJSON = PROJECT_ROOT / "greece_boundary.geojson"

# ---------------------------------------------------------------------------
# Download .poly if needed
# ---------------------------------------------------------------------------
if not POLY_PATH.exists():
    print("Downloading Greece boundary from Geofabrik...")
    urllib.request.urlretrieve(
        "https://download.geofabrik.de/europe/greece.poly",
        POLY_PATH,
    )
    print("Done.")


def parse_poly(path: Path) -> Polygon | MultiPolygon:
    polys  = []
    coords: list[tuple[float, float]] = []
    for line in path.open():
        line = line.strip()
        if not line or line == "END":
            if coords:
                polys.append(Polygon(coords))
                coords = []
        else:
            parts = line.split()
            if len(parts) == 2:
                try:
                    x, y = float(parts[0]), float(parts[1])
                    coords.append((x, y))
                except ValueError:
                    pass
    return MultiPolygon(polys) if len(polys) > 1 else polys[0]


# ---------------------------------------------------------------------------
# Build / load boundary GeoJSON
# ---------------------------------------------------------------------------
if not BOUNDARY_GEOJSON.exists():
    print("Parsing Greece boundary...")
    greece_geom = parse_poly(POLY_PATH)
    with BOUNDARY_GEOJSON.open("w") as f:
        json.dump(
            {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "geometry": mapping(greece_geom), "properties": {}},
                ],
            },
            f,
        )
    print("Done.")
else:
    import geopandas as gpd
    greece_geom = gpd.read_file(BOUNDARY_GEOJSON).union_all()

print("Loading Greece boundary...")
if not hasattr(greece_geom, "contains"):
    import geopandas as gpd
    greece_geom = gpd.read_file(BOUNDARY_GEOJSON).union_all()

# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------
index_path  = PROJECT_ROOT / "index.csv"
output_path = PROJECT_ROOT / "index_greece.csv"

if not index_path.exists():
    raise FileNotFoundError(
        f"SatCLIP index not found at {index_path}. "
        "Download it from the SatCLIP dataset repository."
    )

kept    = 0
skipped = 0

with index_path.open("r", newline="") as fin, \
     output_path.open("w", newline="") as fout:
    reader = csv.DictReader(fin)
    writer = csv.DictWriter(fout, fieldnames=["fn", "lon", "lat"])
    writer.writeheader()
    for row in reader:
        lat = float(row["lat"])
        lon = float(row["lon"])
        # fast bbox pre-filter before expensive .contains()
        if not (19.0 <= lon <= 30.0 and 34.0 <= lat <= 42.5):
            skipped += 1
            continue
        if greece_geom.contains(Point(lon, lat)):
            writer.writerow(row)
            kept += 1
        else:
            skipped += 1

print(f"Kept   : {kept}")
print(f"Skipped: {skipped}")
print(f"Output : {output_path}")
