#!/usr/bin/env python3
from pathlib import Path
import csv
from pyproj import Transformer

def get_utm_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) / 6) + 1
    return 32600 + zone if lat >= 0 else 32700 + zone


def get_patch_bbox(lat: float, lon: float, dist: float) -> tuple[float, float, float, float, int, float, float]:
    epsg = get_utm_epsg(lon, lat)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    to_latlon = Transformer.from_crs(epsg, 4326, always_xy=True)
    cx, cy = to_utm.transform(lon, lat)
    min_lon, min_lat = to_latlon.transform(cx - dist, cy - dist)
    max_lon, max_lat = to_latlon.transform(cx + dist, cy + dist)
    return min_lon, min_lat, max_lon, max_lat, epsg, cx, cy


def inspect_patch_from_csv(patch_name: str, half: int):
    csv_path = Path("../index_greece.csv")
    with csv_path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["fn"] != patch_name:
                continue
            center_lat = float(row["lat"])
            center_lon = float(row["lon"])
            min_lon, min_lat, max_lon, max_lat, epsg, cx, cy = get_patch_bbox(center_lat, center_lon, half)
            return {
                "epsg": epsg,
                "center_lat": center_lat,
                "center_lon": center_lon,
                "center_x": cx,
                "center_y": cy,
                "min_lat": min_lat,
                "min_lon": min_lon,
                "max_lat": max_lat,
                "max_lon": max_lon,
            }
    print(f"  [MISSING] {patch_name} not found in CSV")


if __name__ == "__main__":
    patch_name = "patch_24189.tif"
    half = 1280  # meters, half of 2560m patch
    r = inspect_patch_from_csv(patch_name=patch_name, half=half)

    print(patch_name)
    print(f"  UTM zone:         EPSG:{r['epsg']}")
    print(f"  Center (lat/lon): ({r['center_lat']:.6f}, {r['center_lon']:.6f})")
    print(f"  Center (UTM):     ({r['center_x']:.2f}, {r['center_y']:.2f})")
    print(f"  UTM bbox:         ({r['center_x']-half:.2f}, {r['center_y']-half:.2f}) ({r['center_x']+half:.2f}, {r['center_y']+half:.2f})")
    print(f"  Lat/Lon bbox:     ({r['min_lat']:.6f}, {r['min_lon']:.6f}) ({r['max_lat']:.6f}, {r['max_lon']:.6f})")