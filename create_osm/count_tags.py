#!/usr/bin/env python3
"""
count_tags.py - Count tag keys across all GeoJSON feature files,
broken down by geometry type (point, linestring, polygon).

Run from any directory:
    python create_osm/count_tags.py
"""
from pathlib import Path
from collections import defaultdict
import json

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data"

BACKENDS = {
    d.name: d
    for d in DATA_ROOT.iterdir()
    if d.is_dir()
} if DATA_ROOT.exists() else {}

GEOM_TYPES = ["point", "linestring", "polygon"]
DRILL_TAGS = {"natural"}

backend_counts: dict[str, dict[str, dict[str, int]]] = {}
backend_drill:  dict[str, dict[str, dict[str, dict[str, int]]]] = {}
backend_stats:  dict[str, dict] = {}

# tag_key -> tag_value -> geom_type -> count  (osmnx only, for rule derivation)
osmnx_counts: dict[str, dict[str, dict[str, int]]] = defaultdict(
    lambda: defaultdict(lambda: defaultdict(int))
)

# ── Single pass: collect all data ────────────────────────────────────────────
for backend, data_dir in BACKENDS.items():
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    drill:  dict[str, dict[str, dict[str, int]]] = {
        t: defaultdict(lambda: defaultdict(int)) for t in DRILL_TAGS
    }
    files_read    = 0
    features_read = 0
    bad_features  = []

    for geom_type in GEOM_TYPES:
        for geojson_path in sorted(data_dir.rglob(f"*_{geom_type}.geojson")):
            if geojson_path.stem.endswith("_features"):
                continue
            try:
                with geojson_path.open() as f:
                    data = json.load(f)
            except Exception as e:
                print(f"  [!] Could not read {geojson_path.name}: {e}")
                continue

            files_read += 1
            for feature in data.get("features", []):
                features_read += 1
                label = feature.get("properties", {}).get("label", "")
                parts = [p for p in label.split(";") if ":" in p]

                if not parts:
                    bad_features.append({
                        "file":  geojson_path.name,
                        "geom":  geom_type,
                        "index": features_read,
                        "label": label,
                    })
                    continue

                for part in parts:
                    segments = part.split(":")
                    if len(segments) < 2:
                        continue
                    key   = segments[0].strip()
                    value = segments[1].strip()
                    if not key:
                        continue

                    counts[key][geom_type] += 1

                    if key in DRILL_TAGS and value:
                        drill[key][value][geom_type] += 1

                    if backend == "osmnx" and value:
                        osmnx_counts[key][value][geom_type] += 1

    backend_counts[backend] = counts
    backend_drill[backend]  = drill
    backend_stats[backend]  = {
        "files_read":    files_read,
        "features_read": features_read,
        "bad_features":  bad_features,
    }

# ── Per-backend summary ───────────────────────────────────────────────────────
for backend, counts in backend_counts.items():
    stats = backend_stats[backend]
    drill = backend_drill[backend]

    print(f"\n{'='*60}")
    print(f"  BACKEND: {backend}")
    print(f"{'='*60}")

    all_keys = sorted(counts.keys(), key=lambda k: sum(counts[k].values()), reverse=True)
    col_w = 38
    print(f"\n  {'Tag Key':<{col_w}} {'Point':>10} {'LineString':>12} {'Polygon':>10} {'Total':>10}")
    print(f"  {'-'*col_w} {'-'*10} {'-'*12} {'-'*10} {'-'*10}")
    for key in all_keys:
        pt  = counts[key].get("point",      0)
        ls  = counts[key].get("linestring", 0)
        pg  = counts[key].get("polygon",    0)
        tot = pt + ls + pg
        print(f"  {key:<{col_w}} {pt:>10,} {ls:>12,} {pg:>10,} {tot:>10,}")

    for tag in DRILL_TAGS:
        if not drill[tag]:
            continue
        print(f"\n  --- {tag} value breakdown ---")
        print(f"  {'Value':<30} {'Point':>8} {'LineString':>12} {'Polygon':>10}")
        print(f"  {'-'*30} {'-'*8} {'-'*12} {'-'*10}")
        for val in sorted(drill[tag], key=lambda v: sum(drill[tag][v].values()), reverse=True):
            pt = drill[tag][val].get("point",      0)
            ls = drill[tag][val].get("linestring", 0)
            pg = drill[tag][val].get("polygon",    0)
            print(f"  {val:<30} {pt:>8,} {ls:>12,} {pg:>10,}")

    bad_features = stats["bad_features"]
    print(f"\n  Files read: {stats['files_read']} | Features: {stats['features_read']} | Unique keys: {len(counts)}")
    print("-"*60)
    if not bad_features:
        print("  ALL features have at least one tag")
    else:
        print(f"  {len(bad_features)} features missing tags")
        for bf in bad_features[:50]:
            print(f"    {bf['file']} | {bf['geom']} | idx={bf['index']} | label='{bf['label']}'")
        if len(bad_features) > 50:
            print(f"    ... and {len(bad_features) - 50} more")

# ── Differences between backends ─────────────────────────────────────────────
if len(backend_counts) > 1:
    backend_names = list(backend_counts.keys())
    all_keys = sorted(
        {k for bc in backend_counts.values() for k in bc},
        key=lambda k: sum(sum(bc.get(k, {}).values()) for bc in backend_counts.values()),
        reverse=True,
    )

    print(f"\n{'='*60}")
    print("  DIFFERENCES BETWEEN BACKENDS")
    print(f"{'='*60}")

    col_w = 38
    for geom_type in GEOM_TYPES:
        print(f"\n  -- {geom_type.upper()} --")
        print(f"  {'Tag Key':<{col_w}}" + "".join(f"  {b:>12}" for b in backend_names) + f"  {'Diff':>10}")
        print("  " + "-" * (col_w + 14 * len(backend_names) + 12))
        for key in all_keys:
            vals = [backend_counts[b].get(key, {}).get(geom_type, 0) for b in backend_names]
            if all(v == 0 for v in vals):
                continue
            diff = max(vals) - min(vals)
            if diff == 0:
                continue
            print(f"  {key:<{col_w}}" + "".join(f"  {v:>12,}" for v in vals) + f"  {diff:>+10,}")