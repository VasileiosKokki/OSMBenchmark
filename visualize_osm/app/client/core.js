// This file is concatenated by visualize_osm/app/main.py.
function loadAppData() {
  var req = new XMLHttpRequest();
  req.open('GET', '/api/app-data', false);
  req.send(null);
  if (req.status < 200 || req.status >= 300) {
    throw new Error('Failed to load /api/app-data: HTTP ' + req.status);
  }
  return JSON.parse(req.responseText);
}

var APP_DATA       = loadAppData();
var ALL_META       = APP_DATA.all_meta || {};
var LAZY_MARKERS   = APP_DATA.lazy_markers || {};
var BACKEND_ORDER  = APP_DATA.backend_order || [];
var BACKEND_COLORS = APP_DATA.backend_colors || {};
var activeBackend  = APP_DATA.default_backend;

var sharedActiveIds = new Set();
var layers = {};
var markerGroups = {};
var activeMarkers = [];
var maximizedPatchId = null;
var detailPanelMinimized = false;
var hiddenFeatureIds = {};
var toggleAllButtonModes = {};
var featureSearchByPatch = {};
var featureTableState = null;
var FEATURE_ROW_HEIGHT = 35;
var FEATURE_ROW_BUFFER = 12;
var FEATURE_PANEL_BATCH = 350;
var FEATURE_WORKER_CHUNK_SIZE = 120;
var PANEL_MIN_WIDTH = 360;
var PANEL_MAX_WIDTH = 620;
var PANEL_MIN_HEIGHT = 360;
var PANEL_HARD_MIN_HEIGHT = 300;
var PANEL_MIN_SIDEBAR_HEIGHT = 88;
var PANEL_HARD_MIN_SIDEBAR_HEIGHT = 64;
var PANEL_DEFAULT_SIDEBAR_HEIGHT = 120;
var PANEL_GAP = 8;
var PANEL_TOP_CLEARANCE = 64;
var PANEL_BOTTOM_CLEARANCE = 24;
var PANEL_DEFAULT_WIDTH = PANEL_MIN_WIDTH;
var PANEL_DEFAULT_HEIGHT = PANEL_MIN_HEIGHT;
var PANEL_SIZE_STORAGE_KEY = 'visualize-osm-maplibre-panel-size-v1';
var FEATURE_TABLE_COLUMNS = 'minmax(64px, .85fr) minmax(64px, 1.2fr) minmax(64px, .85fr) minmax(70px, 1fr)';
var fpsCounterStarted = false;
var featureWorkerSeq = 0;
var FEATURE_WORKER_VERSION = 3;
var selectedFeaturePatchId = null;
var selectedFeatureRawFeature = null;
var selectedFeatureFlashTimer = 0;
var selectedFeatureFlashRaf = 0;
var selectedFeatureOverlay = null;
var selectedFeatureFlashAlpha = 1;
var featureNavigationTargetKey = null;
var featureNavigationClearTimer = 0;
var featureNavigationSuppressUntil = 0;
var frozenFeatureOverlay = null;
var frozenFeatureAnchorLngLat = null;
var frozenFeatureAnchorPixel = null;
var frozenFeatureLayerVisibility = [];
var frozenFeatureDragging = false;
var frozenFeatureBuildSeq = 0;
var frozenFeatureBuildScheduled = false;
var frozenFeatureRestoreTimer = 0;

var MAPLIBRE_FEATURE_SOURCE_TOLERANCE = 1.0;
var PATCH_FOCUS_MAX_ZOOM = 15;
var FEATURE_FOCUS_MAX_ZOOM = 19;
var DEFAULT_FOCUS_MAX_ZOOM = 16;
var FEATURE_MIN_FOCUS_BBOX_M = 30;
var ENABLE_FROZEN_FEATURE_DRAG = false;
var SELECTED_FEATURE_STROKE_METERS = 4;
var SELECTED_FEATURE_MAX_STROKE_PX = 6;
var SELECTED_FEATURE_POINT_RADIUS_PX = ['interpolate', ['linear'], ['zoom'], 7, 5.5, 16, 8.5, 20, 13.5];
var SELECTED_FEATURE_POINT_STROKE_PX = ['interpolate', ['linear'], ['zoom'], 7, 2, 16, 3, 20, 4.5];
var SELECTED_FEATURE_MIN_RENDER_ZOOM = 16;
var SELECTED_FEATURE_MAX_RENDER_ZOOM = 19;
var initialMapLibreViewApplied = false;

function clampNumber(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function applyInitialMapLibreView() {
  if (initialMapLibreViewApplied) return;
  initialMapLibreViewApplied = true;
  if (!map || !map.jumpTo) return;
  var center = window.INITIAL_MAPLIBRE_CENTER || [22.0, 39.0];
  var zoom = window.INITIAL_MAPLIBRE_ZOOM == null ? 7 : window.INITIAL_MAPLIBRE_ZOOM;
  if (map.resize) map.resize();
  if (window.INITIAL_MAPLIBRE_BOUNDS && map.fitBounds) {
    map.fitBounds(window.INITIAL_MAPLIBRE_BOUNDS, {
      padding: 48,
      duration: 0,
      maxZoom: window.INITIAL_MAPLIBRE_MAX_FIT_ZOOM || zoom
    });
    return;
  }
  map.jumpTo({
    center: center.slice ? center.slice() : center,
    zoom: zoom
  });
}

function loadPanelSize() {
  try {
    var raw = localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
    if (!raw) return { width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT, sidebarHeight: PANEL_DEFAULT_SIDEBAR_HEIGHT };
    var parsed = JSON.parse(raw);
    return {
      width: clampNumber(Number(parsed.width) || PANEL_DEFAULT_WIDTH, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH),
      height: Math.max(PANEL_HARD_MIN_HEIGHT, Number(parsed.height) || PANEL_DEFAULT_HEIGHT),
      sidebarHeight: Math.max(PANEL_HARD_MIN_SIDEBAR_HEIGHT, Number(parsed.sidebarHeight) || PANEL_DEFAULT_SIDEBAR_HEIGHT)
    };
  } catch (err) {
    return { width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT, sidebarHeight: PANEL_DEFAULT_SIDEBAR_HEIGHT };
  }
}

var panelSize = loadPanelSize();

function PL() { return layers[activeBackend] || {}; }

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
    return ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c];
  });
}

function startFpsCounter() {
  if (fpsCounterStarted) return;
  fpsCounterStarted = true;
  var rateEl = document.getElementById('fps-counter-rate');
  if (!rateEl || !window.requestAnimationFrame) return;
  var frames = 0;
  var last = performance.now ? performance.now() : Date.now();
  function tick(now) {
    frames += 1;
    if (now - last >= 500) {
      rateEl.textContent = Math.round(frames * 1000 / Math.max(1, now - last)) + ' fps';
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function featureIdKey(backend) {
  var name = backend || activeBackend;
  return name === 'osmium' ? '@id' : (name === 'postgis' ? 'osm_id' : 'id');
}

function normalizeFeatureId(value) {
  var text = String(value == null ? '' : value).toLowerCase().replace(/^osm_/, '').trim();
  return /^[rwn]\d+$/.test(text) ? text.slice(1) : text;
}

function getFeatureId(feature, backend) {
  var props = (feature && feature.properties) || {};
  return normalizeFeatureId(props[featureIdKey(backend || activeBackend)] || props.osmid || props.osm_id || props.id || props['@id'] || '');
}

function featureNavigationKey(patchId, feature) {
  if (!feature) return '';
  var props = feature.properties || {};
  var idx = feature._featureIdx != null ? feature._featureIdx : props._featureIdx;
  if (idx != null && isFinite(Number(idx))) {
    return activeBackend + '|' + String(patchId) + '|idx:' + Number(idx);
  }
  var id = getFeatureId(feature);
  return id ? activeBackend + '|' + String(patchId) + '|id:' + id : '';
}

function clearFeatureNavigationTarget(key) {
  if (key && featureNavigationTargetKey !== key) return;
  featureNavigationTargetKey = null;
  featureNavigationSuppressUntil = 0;
  if (featureNavigationClearTimer) {
    window.clearTimeout(featureNavigationClearTimer);
    featureNavigationClearTimer = 0;
  }
}

function beginFeatureNavigation(patchId, feature, duration) {
  var key = featureNavigationKey(patchId, feature);
  if (!key) return;
  featureNavigationTargetKey = key;
  featureNavigationSuppressUntil = (performance.now ? performance.now() : Date.now()) + Math.max(0, duration || 0) + 250;
  if (featureNavigationClearTimer) window.clearTimeout(featureNavigationClearTimer);
  featureNavigationClearTimer = window.setTimeout(function() {
    clearFeatureNavigationTarget(key);
  }, Math.max(0, duration || 0) + 250);
}

function isFeatureNavigationRepeatClick(patchId, feature) {
  var key = featureNavigationKey(patchId, feature);
  var now = performance.now ? performance.now() : Date.now();
  return !!(key && key === featureNavigationTargetKey && now <= featureNavigationSuppressUntil);
}

function getOSMType(props) {
  var first = String((props && props.label) || '').split(';')[0];
  if (!first) return 'other';
  var sep = first.indexOf(':') >= 0 ? ':' : (first.indexOf('=') >= 0 ? '=' : '');
  if (!sep) return 'other';
  return first.split(sep)[0].trim() || 'other';
}

function getOSMValue(props) {
  var first = String((props && props.label) || '').split(';')[0];
  if (!first) return 'other';
  var sep = first.indexOf(':') >= 0 ? ':' : (first.indexOf('=') >= 0 ? '=' : '');
  if (!sep) return 'other';
  return first.split(sep).slice(1).join(sep).trim() || 'other';
}

function collectCoords(c, out) {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === 'number' && typeof c[1] === 'number') {
    out.push(c);
    return;
  }
  c.forEach(function(child) { collectCoords(child, out); });
}

function geometryLonLatExtent(geometry) {
  if (!geometry) return null;
  var coords = [];
  if (geometry.type === 'GeometryCollection') {
    (geometry.geometries || []).forEach(function(child) { collectCoords(child.coordinates, coords); });
  } else {
    collectCoords(geometry.coordinates, coords);
  }
  if (!coords.length) return null;
  var minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  coords.forEach(function(c) {
    var lon = Number(c[0]), lat = Number(c[1]);
    if (!isFinite(lon) || !isFinite(lat)) return;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  });
  if (!isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

function extentToBounds(extent) {
  return [[extent[0], extent[1]], [extent[2], extent[3]]];
}

function extentCenter(extent) {
  return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
}

function expandExtentToMinMeters(extent, minMeters) {
  if (!extent) return null;
  var centerLat = (extent[1] + extent[3]) / 2;
  var latPad = (minMeters / 111320) / 2;
  var lonPad = latPad / Math.max(0.1, Math.cos(centerLat * Math.PI / 180));
  var centerLon = (extent[0] + extent[2]) / 2;
  return [
    Math.min(extent[0], centerLon - lonPad),
    Math.min(extent[1], centerLat - latPad),
    Math.max(extent[2], centerLon + lonPad),
    Math.max(extent[3], centerLat + latPad)
  ];
}

function mercatorY(lat) {
  var clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360)) * 6378137;
}

function projectedExtentSpan(extent) {
  if (!extent) return 1;
  var x1 = extent[0] * 20037508.342789244 / 180;
  var x2 = extent[2] * 20037508.342789244 / 180;
  var y1 = mercatorY(extent[1]);
  var y2 = mercatorY(extent[3]);
  return Math.max(1, Math.abs(x2 - x1), Math.abs(y2 - y1));
}

function smoothStep(value) {
  value = Math.max(0, Math.min(1, value));
  return value * value * (3 - 2 * value);
}

function blendExtents(fromExtent, toExtent, amount) {
  return [
    fromExtent[0] + (toExtent[0] - fromExtent[0]) * amount,
    fromExtent[1] + (toExtent[1] - fromExtent[1]) * amount,
    fromExtent[2] + (toExtent[2] - fromExtent[2]) * amount,
    fromExtent[3] + (toExtent[3] - fromExtent[3]) * amount
  ];
}

function featureFocusExtent(extent, patchExtent) {
  if (!patchExtent || patchExtent.length !== 4) return extent;
  var featureSpan = projectedExtentSpan(extent);
  var patchSpan = Math.max(featureSpan, projectedExtentSpan(patchExtent));
  var blendAmount = smoothStep(Math.sqrt(featureSpan / patchSpan));
  return blendExtents(extent, patchExtent, blendAmount);
}

function fitZoomForExtent(extent, maxZoom) {
  if (!extent || !map.cameraForBounds) return maxZoom || DEFAULT_FOCUS_MAX_ZOOM;
  var camera = map.cameraForBounds(extentToBounds(extent), { padding: 80 });
  var z = camera && isFinite(camera.zoom) ? camera.zoom : (maxZoom || DEFAULT_FOCUS_MAX_ZOOM);
  return maxZoom == null ? z : Math.min(z, maxZoom);
}

function featureFocusZoom(extent, patchExtent, focusExtent) {
  var targetZoom = fitZoomForExtent(focusExtent || extent, FEATURE_FOCUS_MAX_ZOOM);
  if (!patchExtent || patchExtent.length !== 4) return targetZoom;
  var patchZoom = fitZoomForExtent(patchExtent, 16);
  return Math.max(patchZoom, targetZoom);
}

function featureExtent(feature) {
  return geometryLonLatExtent(feature && feature.geometry);
}

function focusExtent(extent, maxZoom) {
  if (!extent) return false;
  var bounds = extentToBounds(extent);
  map.fitBounds(bounds, {
    padding: 80,
    maxZoom: maxZoom || DEFAULT_FOCUS_MAX_ZOOM,
    duration: 800,
    essential: true,
    easing: smoothStep
  });
  return true;
}

function focusPatchMeta(meta, maxZoom) {
  if (!meta || !meta.bbox) return false;
  return focusExtent(meta.bbox, maxZoom || PATCH_FOCUS_MAX_ZOOM);
}

function focusPatchMetaFromMarker(meta, maxZoom) {
  if (!meta || !meta.bbox) return false;
  var targetMaxZoom = maxZoom || PATCH_FOCUS_MAX_ZOOM;
  var targetZoom = fitZoomForExtent(meta.bbox, targetMaxZoom);
  var currentZoom = map && map.getZoom ? map.getZoom() : null;
  if (isFinite(currentZoom) && isFinite(targetZoom) && currentZoom > targetZoom) return false;
  return focusPatchMeta(meta, targetMaxZoom);
}

function focusRawFeature(feature, patchId) {
  var extent = expandExtentToMinMeters(featureExtent(feature), FEATURE_MIN_FOCUS_BBOX_M);
  if (!extent) return false;
  var focusPatchId = patchId == null ? selectedFeaturePatchId : String(patchId);
  var patchMeta = focusPatchId ? (ALL_META[activeBackend] || {})[focusPatchId] : null;
  var patchExtent = patchMeta && patchMeta.bbox ? patchMeta.bbox : null;
  var focus = featureFocusExtent(extent, patchExtent);
  var center = extentCenter(extent);
  var duration = 800;
  beginFeatureNavigation(focusPatchId, feature, duration);
  map.easeTo({
    center: center,
    zoom: featureFocusZoom(extent, patchExtent, focus),
    duration: duration,
    essential: true,
    easing: smoothStep
  });
  return true;
}
