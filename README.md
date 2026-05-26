# OSM Backend Benchmark

Compare three approaches for extracting OpenStreetMap data for a set of satellite image patches:

| Backend | Method | Speed | Disk use | Offline? |
|---------|--------|-------|----------|----------|
| **osmnx** | Overpass API | Slow (rate-limited) | Low | No |
| **postgis** | Local PostgreSQL + PostGIS | Fast | High (full DB) | Yes |
| **osmium** | Local `.osm.pbf` + `osmium` CLI | Fast | Medium (one PBF) | Yes |

The goal is to determine which backend produces the fastest, most space-efficient, and most accurate GeoJSON output for a given set of patches, then visualise the results side-by-side.

---

## Project structure

```
osm_benchmark/
├── create_osm/                  # Step 2 — download / extract OSM data
│   ├── main.py                  # Entry point: iterates patches, calls OSMDownloader
│   ├── osm.py                   # OSMDownloader class (all three backends)
│   ├── find_patch_bbox.py       # UTM bbox helper
│   ├── filter_csv_for_greece.py # Step 1 — filter SatCLIP index to Greece
│   ├── load_postgis.py          # Step 1 (PostGIS only) — import PBF into DB
│   └── count_tags.py            # Step 3 — analyse tag coverage per backend
│
├── visualize_osm/               # Step 3 — interactive Folium map
│   ├── main.py                  # Entry point: build patches_map.html
│   ├── expose_server.py         # Serve the project root over HTTP
│   ├── config.py                # Shared paths, backends, colours
│   ├── data.py                  # Load patch index + build GeoJSON metadata
│   ├── map_builder.py           # Build Folium map + inject Turf.js
│   ├── js_logic.py              # Client-side JS for lazy marker loading
│   ├── styles.py                # CSS
│   ├── templates.py             # Static HTML snippets
│   └── toggle_button.py        # Backend-toggle UI
│
├── data/                        # Generated outputs (git-ignored)
│   ├── osmnx/osm_<i>/           # GeoJSON per patch from osmnx
│   ├── postgis/osm_<i>/         # GeoJSON per patch from PostGIS
│   └── osmium/osm_<i>/          # GeoJSON per patch from osmium
│
├── index.csv                    # Patch index (fn, lon, lat)
├── index_greece.csv             # Filtered patch index (fn, lon, lat)
├── w2v_columns.csv              # Tag vocabulary from hex2vec
├── polygon-features.json        # osm-polygon-features ruleset (tyrasd)
├── greece_boundary.geojson
├── greece.poly
├── osm_filter.lua
├── requirements.txt
└── .gitignore
```

---

## Setup

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Install system tools

**osmium** (required for the `osmium` backend):
```bash
# Ubuntu / Debian
sudo apt install osmium-tool

# macOS
brew install osmium-tool
```

**osm2pgsql + PostgreSQL + PostGIS** (required for the `postgis` backend):
```bash
# Ubuntu / Debian
sudo apt install osm2pgsql postgresql postgis
```

### 3. Download the Greece PBF

Place the file in the project root — `main.py` will auto-detect it:

```bash
wget -P . https://download.geofabrik.de/europe/greece-latest.osm.pbf
```

### 4. Download reference files

- `w2v_columns.csv` — from the [hex2vec repository](https://github.com/srai-lab/hex2vec)
- `polygon-features.json` — from [osm-polygon-features](https://github.com/tyrasd/osm-polygon-features)

---

## Running the pipeline

### Step 1 — Prepare the index

Filter the full SatCLIP dataset index to patches inside Greece:

```bash
python create_osm/filter_csv_for_greece.py
```

This reads `satclip-dataset/index.csv` (download from the SatCLIP repo) and writes `index_greece.csv`.

### Step 1b — Load PostGIS (PostGIS backend only)

```bash
python create_osm/load_postgis.py
```

### Step 2 — Extract OSM data

Edit the `BACKEND` variable at the top of `create_osm/main.py`, then run:

```bash
python create_osm/main.py
```

Output goes to `data/<backend>/osm_<i>/<patch_stem>_<geom_type>.geojson`.

Repeat for each backend you want to compare.

### Step 3 — Visualise

Build the map:

```bash
python visualize_osm/main.py
```

Serve it:

```bash
python visualize_osm/expose_server.py
# Open http://localhost:8000/
```

### Step 4 — Analyse tag coverage

```bash
python create_osm/count_tags.py
```

---

## Configuration

All tunable knobs live at the top of `create_osm/main.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND` | `"osmium"` | Which backend to use (`"osmnx"`, `"postgis"`, `"osmium"`) |
| `DIST` | `1280` | Patch half-width in metres (patch = 2×DIST square) |
| `LIMIT` | `None` | Cap on number of patches to process; `None` = all |
| `DRY_RUN` | `False` | Log actions without writing any files |
| `DSN` | `"dbname=osm_db ..."` | PostgreSQL connection string (PostGIS only) |

---

## Output format

Each processed patch produces:

```
data/<backend>/osm_<i>/
    <patch_stem>_features.geojson    # all geometry types combined
    <patch_stem>_point.geojson
    <patch_stem>_linestring.geojson
    <patch_stem>_polygon.geojson
```

Every feature has a `label` property in the form `key:value;key:value;...` derived from the tag vocabulary in `w2v_columns.csv`.

---

## Notes

- The `osmnx` backend hits the public Overpass API and is subject to rate limiting — use `LIMIT` during development.
- The `osmium` backend is fully offline once the PBF is downloaded and is the recommended default.
- The `postgis` backend needs the PBF imported to postgis via `load-postgis`.
- `count_tags.py` prints a per-backend breakdown of tag key frequency and can be used to verify that all backends agree on feature coverage.
