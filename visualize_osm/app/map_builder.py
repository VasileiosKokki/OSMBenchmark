"""
map_builder.py - Creates the interactive map shell.

Feature and marker data are loaded by the frontend from the server API.
"""
import json
import math
from pathlib import Path


def _collect_lonlat_pairs(value, out: list[tuple[float, float]]) -> None:
    if not isinstance(value, list):
        return
    if (
        len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        out.append((float(value[0]), float(value[1])))
        return
    for child in value:
        _collect_lonlat_pairs(child, out)


def _boundary_lonlat_pairs(boundary_path: Path) -> list[tuple[float, float]]:
    data = json.loads(boundary_path.read_text(encoding="utf-8"))
    pairs: list[tuple[float, float]] = []
    if data.get("type") == "FeatureCollection":
        for feature in data.get("features") or []:
            _collect_lonlat_pairs((feature.get("geometry") or {}).get("coordinates"), pairs)
    elif data.get("type") == "Feature":
        _collect_lonlat_pairs((data.get("geometry") or {}).get("coordinates"), pairs)
    else:
        _collect_lonlat_pairs(data.get("coordinates"), pairs)
    return pairs


def _mercator_y(lat: float) -> float:
    lat = max(-85.05112878, min(85.05112878, lat))
    rad = math.radians(lat)
    return (1.0 - math.log(math.tan(rad) + (1.0 / math.cos(rad))) / math.pi) / 2.0


def _initial_greece_view() -> dict:
    fallback_bbox = [18.97064, 34.59111, 29.65683, 41.74954]
    boundary_path = Path(__file__).resolve().parents[2] / "greece_boundary.geojson"
    try:
        pairs = _boundary_lonlat_pairs(boundary_path)
        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        bbox = [min(xs), min(ys), max(xs), max(ys)]
    except (OSError, ValueError, json.JSONDecodeError):
        bbox = fallback_bbox

    lon_span = max(0.000001, bbox[2] - bbox[0])
    mercator_span = max(0.000001, abs(_mercator_y(bbox[3]) - _mercator_y(bbox[1])))
    nominal_width = 1024 - 128 * 2
    nominal_height = 768 - 128 * 2
    zoom_x = math.log2(nominal_width / (256 * (lon_span / 360)))
    zoom_y = math.log2(nominal_height / (256 * mercator_span))
    zoom = max(0, min(6.3, min(zoom_x, zoom_y)))

    return {
        "bbox": bbox,
        "bounds": [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        "center": [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        "zoom": round(zoom, 2),
    }


def build_map(html_path: Path | None = None) -> str:
    """Build a MapLibre GL HTML shell and return the JS map variable name."""
    if html_path is None:
        html_path = Path(__file__).resolve().parents[1] / "patches_map.html"
    initial_view = _initial_greece_view()
    html = (
        """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OSM patches - MapLibre GL</title>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: sans-serif;
    }
    body {
      background: #111;
    }
    .maplibregl-map {
      font-family: sans-serif;
    }
    .maplibregl-ctrl-bottom-right {
      font-size: 11px;
    }
    .maplibre-popup-button {
      appearance: none;
      border: 0;
      border-radius: 4px;
      padding: 7px 10px;
      background: #202632;
      color: #fff;
      cursor: pointer;
      font: 600 13px sans-serif;
    }
    .maplibregl-popup-content {
      padding: 10px 12px;
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0,0,0,.32);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var BASE_OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    var INITIAL_MAPLIBRE_CENTER = __INITIAL_MAPLIBRE_CENTER__;
    var INITIAL_MAPLIBRE_ZOOM = __INITIAL_MAPLIBRE_ZOOM__;
    var INITIAL_MAPLIBRE_BOUNDS = __INITIAL_MAPLIBRE_BOUNDS__;
    var INITIAL_MAPLIBRE_MAX_FIT_ZOOM = __INITIAL_MAPLIBRE_MAX_FIT_ZOOM__;
    var map = new maplibregl.Map({
      container: 'map',
      center: INITIAL_MAPLIBRE_CENTER.slice(),
      zoom: INITIAL_MAPLIBRE_ZOOM,
      minZoom: 0,
      maxZoom: 22,
      doubleClickZoom: false,
      dragPan: {
        linearity: 0.3,
        easing: function(t) { return t * (2 - t); },
        maxSpeed: 1400,
        deceleration: 2500
      },
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [BASE_OSM_TILE_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm'
          }
        ]
      }
    });

    function applyInitialMapLibreCamera() {
      map.resize();
      if (map.fitBounds && INITIAL_MAPLIBRE_BOUNDS) {
        map.fitBounds(INITIAL_MAPLIBRE_BOUNDS, {
          padding: 48,
          duration: 0,
          maxZoom: INITIAL_MAPLIBRE_MAX_FIT_ZOOM
        });
        return;
      }
      map.jumpTo({
        center: INITIAL_MAPLIBRE_CENTER.slice(),
        zoom: INITIAL_MAPLIBRE_ZOOM
      });
    }

    map.once('load', function() {
      applyInitialMapLibreCamera();
    });

    function smoothZoomEasing(t) {
      return t * t * (3 - 2 * t);
    }

    function smoothZoomBy(delta) {
      map.easeTo({
        zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + delta)),
        duration: 260,
        essential: true,
        easing: smoothZoomEasing
      });
    }

    function SmoothZoomControl() {}
    SmoothZoomControl.prototype.onAdd = function(mapInstance) {
      var container = document.createElement('div');
      container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      [
        { label: '+', title: 'Zoom in', delta: 1 },
        { label: '-', title: 'Zoom out', delta: -1 }
      ].forEach(function(action) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.label;
        button.title = action.title;
        button.setAttribute('aria-label', action.title);
        button.addEventListener('click', function(e) {
          e.preventDefault();
          smoothZoomBy(action.delta);
        });
        container.appendChild(button);
      });
      this._map = mapInstance;
      this._container = container;
      return container;
    };
    SmoothZoomControl.prototype.onRemove = function() {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
      this._map = undefined;
    };

    map.addControl(new SmoothZoomControl(), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (map.doubleClickZoom && map.doubleClickZoom.disable) {
      map.doubleClickZoom.disable();
    }
    if (map.scrollZoom && map.scrollZoom.disable) {
      map.scrollZoom.disable();
    }

    var wheelZoomTarget = null;
    var wheelZoomTimer = 0;
    map.getContainer().addEventListener('wheel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var rect = map.getContainer().getBoundingClientRect();
      var point = [
        e.clientX - rect.left,
        e.clientY - rect.top
      ];
      var around = map.unproject(point);
      var modeScale = e.deltaMode === 1 ? 45 : (e.deltaMode === 2 ? 450 : 1);
      var delta = -e.deltaY * modeScale / 950;
      if (!isFinite(delta) || Math.abs(delta) < 0.001) return;
      delta = Math.max(-0.45, Math.min(0.45, delta));
      if (wheelZoomTarget == null) wheelZoomTarget = map.getZoom();
      wheelZoomTarget = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), wheelZoomTarget + delta)
      );
      map.easeTo({
        zoom: wheelZoomTarget,
        around: around,
        duration: 220,
        essential: true,
        easing: smoothZoomEasing
      });
      if (wheelZoomTimer) window.clearTimeout(wheelZoomTimer);
      wheelZoomTimer = window.setTimeout(function() {
        wheelZoomTarget = null;
        wheelZoomTimer = 0;
      }, 180);
    }, { passive: false, capture: true });
  </script>
</body>
</html>
"""
    )
    html = html.replace("__INITIAL_MAPLIBRE_CENTER__", json.dumps(initial_view["center"]))
    html = html.replace("__INITIAL_MAPLIBRE_ZOOM__", json.dumps(initial_view["zoom"]))
    html = html.replace("__INITIAL_MAPLIBRE_BOUNDS__", json.dumps(initial_view["bounds"]))
    html = html.replace("__INITIAL_MAPLIBRE_MAX_FIT_ZOOM__", json.dumps(initial_view["zoom"]))
    html_path.write_text(html, encoding="utf-8")
    return "map"


def inject_turf(html_path: str | None = None):
    if html_path is None:
        html_path = str(Path(__file__).resolve().parents[1] / "patches_map.html")
    path = Path(html_path)
    html = path.read_text(encoding="utf-8")
    html = html.replace(
        "</head>",
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js"></script>\n</head>',
        1,
    )
    path.write_text(html, encoding="utf-8")
