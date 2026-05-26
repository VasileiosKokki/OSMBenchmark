import logging
from pathlib import Path
import osmnx as ox
import torch
import numpy as np
from scipy.spatial import Delaunay
from torch_geometric.data import HeteroData
from sklearn.preprocessing import OneHotEncoder
import json
import pandas as pd
from transformers import CLIPTokenizer, CLIPTextModel

from find_patch_bbox import get_patch_bbox

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load exact (key, value) pairs from CSV — used by ALL backends for filtering
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]

_tags_df = pd.read_csv(PROJECT_ROOT / "w2v_columns.csv")
USEFUL_TAG_PAIRS: set[tuple[str, str]] = set()
for _col in _tags_df["column"]:
    _parts = _col.split("_", 1)
    if len(_parts) == 2:
        USEFUL_TAG_PAIRS.add((_parts[0], _parts[1]))

USEFUL_TAGS: set[str] = {k for k, v in USEFUL_TAG_PAIRS}


class OSMDownloader:
    """
    Download OSM data for a given point and distance.

    Supports three backends:
      - 'osmnx'   : hits Overpass API
      - 'postgis' : queries a local PostGIS database
      - 'osmium'  : reads a local .osm.pbf file via osmium extract + parse

    All backends filter to exact (key, value) pairs from w2v_columns.csv
    and produce the same label format: "key:value;key:value;..."
    """

    def __init__(self, lat, lon, dist, output_file, image_stem,
                 backend: str = 'osmnx', db_conn=None, pbf_path: str = None,
                 osmium_index=None):
        self.lat = lat
        self.lon = lon
        self.dist = dist
        self.output_file = output_file
        self.image_stem = image_stem
        self.backend = backend
        self.db_conn = db_conn
        self.pbf_path = pbf_path

    def __call__(self):
        if self.backend == 'postgis':
            self._download_postgis()
        elif self.backend == 'osmnx':
            self._download_osmnx()
        else:
            self._download_osmium()

    def _get_bbox(self) -> tuple[float, float, float, float, int, float, float]:
        return get_patch_bbox(self.lat, self.lon, self.dist)

    def _download_osmnx(self):
        from shapely.geometry import box

        min_lon, min_lat, max_lon, max_lat, _, _, _ = self._get_bbox()
        bbox_geom = box(min_lon, min_lat, max_lon, max_lat)
        location_point = (self.lat, self.lon)

        logger.info(f"[osmnx] Downloading OSM data for {location_point} dist={self.dist}m")
        tags = {k: True for k in USEFUL_TAGS}
        try:
            features = ox.features_from_bbox(
                bbox=(min_lon, min_lat, max_lon, max_lat),
                tags=tags
            )
        except ox._errors.InsufficientResponseError:
            logger.warning(f"[osmnx] No features at {location_point} — skipping")
            raise

        logger.info(f"Downloaded {len(features)} features from OSM.")

        features = features.copy()
        features = features.set_geometry(
            features['geometry'].intersection(bbox_geom)
        )
        features = features[~features.geometry.is_empty].copy()

        features['label'] = None
        for idx, row in features.iterrows():
            parts = []
            for k in USEFUL_TAGS:
                v = row.get(k)
                if v is not None and not (isinstance(v, float) and pd.isna(v)) and (k, str(v)) in USEFUL_TAG_PAIRS:
                    parts.append(f"{k}:{v}")
            features.at[idx, 'label'] = ';'.join(parts) if parts else None

        before = len(features)
        features = features[features['label'].notna()].copy()
        logger.info(f"[osmnx] {before - len(features)} features dropped by tag filter, {len(features)} remaining")

        if features.empty:
            logger.warning(f"[osmnx] No features remain after filtering for {location_point}")
            return

        features.to_file(f"{self.output_file}_features.geojson", driver="GeoJSON")
        for geom_type, subset in features.groupby(features.geometry.geom_type):
            subset.to_file(f"{self.output_file}_{geom_type.lower()}.geojson", driver="GeoJSON")

    def _download_postgis(self):
        import psycopg2, psycopg2.extras, geopandas as gpd
        from shapely import wkb

        min_lon, min_lat, max_lon, max_lat, _, _, _ = self._get_bbox()
        bbox = (min_lon, min_lat, max_lon, max_lat)

        conn = psycopg2.connect(self.db_conn) if isinstance(self.db_conn, str) else self.db_conn
        conn.rollback()
        logger.info(f"[postgis] Querying ({self.lat:.4f}, {self.lon:.4f})")

        all_gdfs = []
        for table, geom_type in [
            ('planet_osm_polygon',  'polygon'),
            ('planet_osm_line',     'linestring'),
            ('planet_osm_point',    'point'),
        ]:
            sql = f"""
                SELECT osm_id, name, hstore_to_json(tags) AS tags,
                    ST_AsEWKB(ST_Transform(ST_Intersection(
                        way, ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857)
                    ), 4326)) AS geom_wkb
                FROM {table}
                WHERE way && ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857)
                AND   ST_Intersects(way, ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857))
            """
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(sql, bbox * 3)
                    rows = cur.fetchall()
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.warning(f"[postgis] Query failed for {table}: {e}")
                continue

            records = []
            for row in rows:
                row = dict(row)
                raw_wkb = row.pop('geom_wkb')
                extra_tags = row.pop('tags') or {}
                if raw_wkb is None:
                    continue
                try:
                    geom = wkb.loads(bytes(raw_wkb))
                except Exception as e:
                    logger.debug(f"[postgis] Failed to parse geometry: {e}")
                    continue
                if geom is None or geom.is_empty:
                    continue

                # no need for useful tags, already filtered during import
                parts = [f"{k}:{v}" for k, v in extra_tags.items() if v]

                row["label"] = ";".join(parts)

                records.append({
                    "geometry": geom,
                    **row,
                    **extra_tags
                })

            if not records:
                logger.info(f"[postgis] No valid {geom_type} geometries after filtering")
                continue

            gdf = gpd.GeoDataFrame(records, geometry='geometry', crs='EPSG:4326')
            gdf.to_file(f"{self.output_file}_{geom_type}.geojson", driver="GeoJSON")
            logger.info(f"✅ [{geom_type}] {len(gdf)} features -> {self.output_file}_{geom_type}.geojson")
            all_gdfs.append(gdf)

        if all_gdfs:
            combined = gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs='EPSG:4326')
            combined.to_file(f"{self.output_file}_features.geojson", driver="GeoJSON")
            logger.info(f"✅ [combined] {len(combined)} features -> {self.output_file}_features.geojson")
        else:
            logger.warning(f"[postgis] No features found for ({self.lat}, {self.lon})")

        if isinstance(self.db_conn, str):
            conn.close()

    def _download_osmium(self):
        import geopandas as gpd, subprocess, tempfile, os, json
        from shapely.geometry import box
        from pathlib import Path

        # ---------------------------------------------------------------------------
        # Build osmium export config from tyrasd/osm-polygon-features ruleset
        # ---------------------------------------------------------------------------
        polygon_features = json.loads(
            (Path(__file__).parent / 'polygon-features.json').read_text()
        )

        area_tags = []
        linear_tags = []
        for rule in polygon_features:
            key    = rule['key']
            mode   = rule['polygon']
            values = rule.get('values', [])
            if mode == 'all':
                area_tags.append(key)
            elif mode == 'blacklist':
                area_tags.append(f"{key}!={','.join(values)}")
                for v in values:
                    linear_tags.append(f"{key}={v}")
            elif mode == 'whitelist':
                for v in values:
                    area_tags.append(f"{key}={v}")
                linear_tags.append(f"{key}!={','.join(values)}")

        export_config = {"area_tags": area_tags, "linear_tags": linear_tags}

        # ---------------------------------------------------------------------------
        # Temp files
        # ---------------------------------------------------------------------------
        min_lon, min_lat, max_lon, max_lat, _, _, _ = self._get_bbox()
        bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"

        with tempfile.NamedTemporaryFile(suffix=".osm.pbf", delete=False) as tmp:
            extract_path = tmp.name
        with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as tmp:
            export_path = tmp.name
        with tempfile.NamedTemporaryFile(suffix=".json", mode='w', delete=False) as tmp:
            json.dump(export_config, tmp)
            config_path = tmp.name

        try:
            # Step 1: extract bbox
            logger.info(f"[osmium] Extracting bbox {bbox_str} from {self.pbf_path}")
            result = subprocess.run(
                ["osmium", "extract", "--bbox", bbox_str,
                "--output", extract_path, "--overwrite", self.pbf_path],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError(f"osmium extract failed:\n{result.stderr}")

            # Step 2: export to GeoJSON using tyrasd-derived area/linear config
            logger.info(f"[osmium] Exporting to GeoJSON with polygon_features.json config")
            result = subprocess.run(
                ["osmium", "export",
                "--geometry-types=point,linestring,polygon",
                "--output-format=geojson",
                "--attributes=type,id",
                "--config", config_path,
                "--output", export_path,
                "--overwrite",
                extract_path],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError(f"osmium export failed:\n{result.stderr}")

            gdf = gpd.read_file(export_path)

        finally:
            for p in (extract_path, export_path, config_path):
                try:
                    os.unlink(p)
                except FileNotFoundError:
                    pass

        if gdf is None or gdf.empty:
            logger.warning(f"[osmium] No features in bbox for ({self.lat}, {self.lon})")
            return

        # ---------------------------------------------------------------------------
        # Filter to only tags we care about (mirrors postgis USEFUL_TAG_PAIRS check)
        # ---------------------------------------------------------------------------
        useful_keys = {k for k, v in USEFUL_TAG_PAIRS}
        available_keys = useful_keys & set(gdf.columns)
        if not available_keys:
            logger.warning(f"[osmium] No useful tag columns found in export")
            return

        mask = gdf[list(available_keys)].notna().any(axis=1)
        gdf = gdf[mask].copy()

        if gdf.empty:
            logger.warning(f"[osmium] No features matched USEFUL_TAG_PAIRS for ({self.lat}, {self.lon})")
            return

        # ---------------------------------------------------------------------------
        # Clip to bbox
        # ---------------------------------------------------------------------------
        bbox_geom = box(min_lon, min_lat, max_lon, max_lat)
        gdf['geometry'] = gdf['geometry'].intersection(bbox_geom)
        gdf = gdf[~gdf['geometry'].is_empty].copy()

        if gdf.empty:
            logger.warning(f"[osmium] No features remain after bbox clip for ({self.lat}, {self.lon})")
            return

        # ---------------------------------------------------------------------------
        # Build label column to mirror postgis output
        # ---------------------------------------------------------------------------
        useful_pairs = set(USEFUL_TAG_PAIRS)
        def build_label(row):
            return ';'.join(
                f"{k}:{row[k]}" for k in available_keys
                if pd.notna(row.get(k)) and (k, row[k]) in useful_pairs
            )
        gdf['label'] = gdf.apply(build_label, axis=1)
        gdf = gdf[gdf['label'] != ''].copy()

        if gdf.empty:
            logger.warning(f"[osmium] No features passed label filter for ({self.lat}, {self.lon})")
            return

        # ---------------------------------------------------------------------------
        # Write outputs
        # ---------------------------------------------------------------------------
        all_gdfs = []
        for geom_type, subset in gdf.groupby(gdf.geometry.geom_type):
            norm = geom_type.lower().replace('multi', '')
            out = f"{self.output_file}_{norm}.geojson"
            subset.to_file(out, driver="GeoJSON")
            logger.info(f"✅ [osmium/{norm}] {len(subset)} features -> {out}")
            all_gdfs.append(subset)

        combined = gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs='EPSG:4326')
        combined.to_file(f"{self.output_file}_features.geojson", driver="GeoJSON")
        logger.info(f"✅ [osmium/combined] {len(combined)} -> {self.output_file}_features.geojson")