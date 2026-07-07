// This file is concatenated by visualize_osm/app/main.py.
function rawFeatureGeometry(rawFeature) {
  return rawFeature && rawFeature.type === 'Feature' ? rawFeature.geometry : rawFeature;
}

function moveSelectedFeatureLayersToTop() {
  if (!map.getStyle()) return;
  [
    'selected-feature-fill',
    'selected-feature-line',
    'selected-feature-circle'
  ].forEach(function(id) {
    if (!map.getLayer(id)) return;
    try {
      map.moveLayer(id);
    } catch (_err) {}
  });
}

function clearSelectedFeatureFlash() {
  if (selectedFeatureFlashTimer) window.clearInterval(selectedFeatureFlashTimer);
  selectedFeatureFlashTimer = 0;
  if (selectedFeatureFlashRaf) window.cancelAnimationFrame(selectedFeatureFlashRaf);
  selectedFeatureFlashRaf = 0;
  selectedFeatureFlashAlpha = 1;
  if (selectedFeatureOverlay && selectedFeatureOverlay.parentNode) {
    selectedFeatureOverlay.parentNode.removeChild(selectedFeatureOverlay);
  }
  selectedFeatureOverlay = null;
  selectedFeaturePatchId = null;
  selectedFeatureRawFeature = null;
  refreshSelectedFeatureRows();
  if (!map.getStyle()) return;
  [
    'selected-feature-fill',
    'selected-feature-line',
    'selected-feature-circle'
  ].forEach(function(id) {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource('selected-feature')) map.removeSource('selected-feature');
}

function selectedFeatureGeoJson(rawFeature) {
  if (!rawFeature) return null;
  if (rawFeature.type === 'Feature') {
    return {
      type: 'Feature',
      geometry: rawFeature.geometry || null,
      properties: rawFeature.properties || {}
    };
  }
  return {
    type: 'Feature',
    geometry: rawFeature,
    properties: {}
  };
}

function emptySelectedFeatureGeoJson() {
  return { type: 'FeatureCollection', features: [] };
}

function isSelectedFeatureHidden() {
  if (!selectedFeatureRawFeature || selectedFeaturePatchId == null) return false;
  var idx = selectedFeatureRawFeature._featureIdx;
  if (idx == null && selectedFeatureRawFeature.properties) idx = selectedFeatureRawFeature.properties._featureIdx;
  return idx != null && isFeatureHidden(String(selectedFeaturePatchId), Number(idx));
}

function resolutionForZoomValue(z) {
  return 156543.03392804097 / Math.pow(2, z);
}

function selectedFeaturePixelsForMetersAtZoom(meters, maxPx, z) {
  var resolution = resolutionForZoomValue(z);
  var renderZoom = Math.max(
    SELECTED_FEATURE_MIN_RENDER_ZOOM,
    Math.min(SELECTED_FEATURE_MAX_RENDER_ZOOM, z)
  );
  var renderResolution = resolutionForZoomValue(renderZoom);
  if (!isFinite(resolution)) resolution = renderResolution;
  if (!isFinite(renderResolution)) renderResolution = resolution;
  var overzoomScale = renderResolution / Math.max(0.0000001, resolution);
  return Math.max(0.1, Math.min(maxPx, meters / renderResolution) * overzoomScale);
}

function selectedFeaturePixelsForMetersExpression(meters, maxPx) {
  var stops = ['interpolate', ['exponential', 2], ['zoom']];
  [0, 7, 12, 14, 16, 17, 18, 19, 20, 21, 22].forEach(function(z) {
    stops.push(z, selectedFeaturePixelsForMetersAtZoom(meters, maxPx, z));
  });
  return stops;
}

function setSelectedFeaturePaintAlpha(alpha) {
  if (!map.getStyle()) return;
  if (map.getLayer('selected-feature-fill')) {
    map.setPaintProperty('selected-feature-fill', 'fill-opacity', alpha * 0.24);
  }
  if (map.getLayer('selected-feature-line')) {
    map.setPaintProperty('selected-feature-line', 'line-opacity', alpha);
  }
  if (map.getLayer('selected-feature-circle')) {
    map.setPaintProperty('selected-feature-circle', 'circle-opacity', alpha * 0.24);
    map.setPaintProperty('selected-feature-circle', 'circle-stroke-opacity', alpha);
  }
  if (map.triggerRepaint) map.triggerRepaint();
}

function ensureSelectedFeatureLayers(rawFeature) {
  if (!rawFeature || !map.getStyle()) return false;
  var hidden = isSelectedFeatureHidden();
  var data = hidden ? emptySelectedFeatureGeoJson() : selectedFeatureGeoJson(rawFeature);
  if (!data || (!hidden && !data.geometry)) return false;
  if (map.getSource('selected-feature')) {
    map.getSource('selected-feature').setData(data);
  } else {
    map.addSource('selected-feature', {
      type: 'geojson',
      data: data,
      maxzoom: 22,
      tolerance: 0,
      buffer: 128
    });
  }
  if (!map.getLayer('selected-feature-fill')) {
    map.addLayer({
      id: 'selected-feature-fill',
      type: 'fill',
      source: 'selected-feature',
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': '#ffeb3b',
        'fill-opacity': selectedFeatureFlashAlpha * 0.24,
        'fill-opacity-transition': { duration: 0, delay: 0 }
      }
    });
  }
  if (!map.getLayer('selected-feature-line')) {
    map.addLayer({
      id: 'selected-feature-line',
      type: 'line',
      source: 'selected-feature',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#ffd400',
        'line-opacity': selectedFeatureFlashAlpha,
        'line-opacity-transition': { duration: 0, delay: 0 },
        'line-width': selectedFeaturePixelsForMetersExpression(
          SELECTED_FEATURE_STROKE_METERS,
          SELECTED_FEATURE_MAX_STROKE_PX
        )
      }
    });
  }
  if (!map.getLayer('selected-feature-circle')) {
    map.addLayer({
      id: 'selected-feature-circle',
      type: 'circle',
      source: 'selected-feature',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': SELECTED_FEATURE_POINT_RADIUS_PX,
        'circle-color': '#ffeb3b',
        'circle-opacity': selectedFeatureFlashAlpha * 0.24,
        'circle-opacity-transition': { duration: 0, delay: 0 },
        'circle-stroke-color': '#ffd400',
        'circle-stroke-opacity': selectedFeatureFlashAlpha,
        'circle-stroke-opacity-transition': { duration: 0, delay: 0 },
        'circle-stroke-width': SELECTED_FEATURE_POINT_STROKE_PX
      }
    });
  }
  setSelectedFeaturePaintAlpha(selectedFeatureFlashAlpha);
  moveSelectedFeatureLayersToTop();
  return true;
}

function renderSelectedFeatureOverlay() {
  if (!selectedFeatureRawFeature) return;
  ensureSelectedFeatureLayers(selectedFeatureRawFeature);
}

function flashFeatureOnMap(patchId, rawFeature) {
  selectedFeaturePatchId = String(patchId);
  selectedFeatureRawFeature = rawFeature;
  whenMapReady(function() {
    clearSelectedFeatureFlash();
    selectedFeaturePatchId = String(patchId);
    selectedFeatureRawFeature = rawFeature;
    selectedFeatureFlashAlpha = 0;
    refreshSelectedFeatureRows();
    ensureSelectedFeatureLayers(rawFeature);
    var start = performance.now ? performance.now() : Date.now();
    var duration = 1600;
    function animate(now) {
      var elapsed = now - start;
      if (elapsed >= duration) {
        selectedFeatureFlashAlpha = 1;
        setSelectedFeaturePaintAlpha(selectedFeatureFlashAlpha);
        selectedFeatureFlashRaf = 0;
        return;
      }
      selectedFeatureFlashAlpha = Math.abs(Math.sin(elapsed / 115));
      setSelectedFeaturePaintAlpha(selectedFeatureFlashAlpha);
      selectedFeatureFlashRaf = requestAnimationFrame(animate);
    }
    selectedFeatureFlashRaf = requestAnimationFrame(animate);
  });
}

function selectRawFeature(patchId, raw, options) {
  options = options || {};
  patchId = String(patchId);
  var state = PL()[patchId];
  if (state && sharedActiveIds.has(patchId) && patchFeatureLayersReady(state)) {
    if (!options.skipFocus) focusRawFeature(raw, patchId);
    if (!options.skipFlash) flashFeatureOnMap(patchId, raw);
    return;
  }
  ensurePatchFeaturesVisible(patchId, function() {
    if (!options.skipFocus) focusRawFeature(raw, patchId);
    if (!options.skipFlash) flashFeatureOnMap(patchId, raw);
  });
}

function selectRawFeatureInDetail(patchId, raw, featureId, options) {
  options = options || {};
  if (!raw) return;
  patchId = String(patchId);
  featureId = featureId || getFeatureId(raw);
  if (!options.skipFocus && isFeatureNavigationRepeatClick(patchId, raw)) return false;
  if (String(maximizedPatchId) !== patchId) saveCurrentFeatureSearch();
  if (options.updateSearch !== false && featureId) setFeatureSearchValue(patchId, featureId);
  var reuseCurrentDetailPanel = (
    String(maximizedPatchId) === patchId &&
    !detailPanelMinimized &&
    featureTableState &&
    String(featureTableState.patchId) === patchId
  );
  maximizedPatchId = patchId;
  detailPanelMinimized = false;
  if (!reuseCurrentDetailPanel) renderUI();
  var searchInput = document.getElementById('osm-feat-search-input');
  if (options.updateSearch !== false && searchInput && featureId) {
    searchInput.value = featureId;
    if (reuseCurrentDetailPanel) filterDetailRows(featureId);
  }
  selectRawFeature(patchId, raw, options);
  applyPanelSize();
  return true;
}

function frozenFeatureStyle(type) {
  var styles = {
    building: { fill: '#888888', fillOpacity: 0.15, stroke: '#555555', strokeOpacity: 0.48 },
    highway: { stroke: '#ff9900', strokeOpacity: 0.9 },
    landuse: { fill: '#66cc66', fillOpacity: 0.14, stroke: '#66cc66', strokeOpacity: 0.62 },
    natural: { fill: '#228833', fillOpacity: 0.13, stroke: '#228833', strokeOpacity: 0.66, circle: '#228833' },
    water: { fill: '#4da6ff', fillOpacity: 0.28, stroke: '#4da6ff', strokeOpacity: 0.76, circle: '#4da6ff' },
    waterway: { stroke: '#4da6ff', strokeOpacity: 0.9 },
    amenity: { fill: '#cc44aa', fillOpacity: 0.12, stroke: '#cc44aa', strokeOpacity: 0.62, circle: '#cc44aa' },
    leisure: { fill: '#00cc44', fillOpacity: 0.14, stroke: '#00cc44', strokeOpacity: 0.62 },
    shop: { fill: '#ff9900', fillOpacity: 0.12, stroke: '#ff9900', strokeOpacity: 0.62, circle: '#ff9900' },
    tourism: { fill: '#ff6688', fillOpacity: 0.12, stroke: '#ff6688', strokeOpacity: 0.62, circle: '#ff6688' }
  };
  return styles[type] || { fill: '#bbbbbb', fillOpacity: 0.06, stroke: '#bbbbbb', strokeOpacity: 0.62, circle: '#bbbbbb' };
}

function featureBoundsForFreeze(feature) {
  return feature && (feature._bounds || featureExtent(feature));
}

function extentsIntersect(a, b) {
  return !!(a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]);
}

function paddedMapBoundsExtent() {
  var bounds = map.getBounds && map.getBounds();
  if (!bounds) return null;
  var west = bounds.getWest();
  var south = bounds.getSouth();
  var east = bounds.getEast();
  var north = bounds.getNorth();
  var lonPad = Math.max(0.00001, (east - west) * 0.15);
  var latPad = Math.max(0.00001, (north - south) * 0.15);
  return [west - lonPad, south - latPad, east + lonPad, north + latPad];
}

function frozenSvgPathForCoords(coords, close) {
  var parts = [];
  (coords || []).forEach(function(coord, idx) {
    if (!coord || coord.length < 2) return;
    var p = map.project([Number(coord[0]), Number(coord[1])]);
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
    parts.push((idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1));
  });
  if (close && parts.length) parts.push('Z');
  return parts.join(' ');
}

function appendFrozenGeometry(geometry, style, parts) {
  if (!geometry) return;
  var coords = geometry.coordinates || [];
  if (geometry.type === 'Point') {
    if (coords.length >= 2) appendFrozenPoint(coords, style, parts);
  } else if (geometry.type === 'MultiPoint') {
    (coords || []).forEach(function(point) { appendFrozenPoint(point, style, parts); });
  } else if (geometry.type === 'LineString') {
    appendFrozenLine(coords, style, parts);
  } else if (geometry.type === 'MultiLineString') {
    (coords || []).forEach(function(line) { appendFrozenLine(line, style, parts); });
  } else if (geometry.type === 'Polygon') {
    appendFrozenPolygon(coords, style, parts);
  } else if (geometry.type === 'MultiPolygon') {
    (coords || []).forEach(function(poly) { appendFrozenPolygon(poly, style, parts); });
  } else if (geometry.type === 'GeometryCollection') {
    (geometry.geometries || []).forEach(function(child) { appendFrozenGeometry(child, style, parts); });
  }
}

function appendFrozenLine(coords, style, parts) {
  var path = frozenSvgPathForCoords(coords, false);
  if (!path) return;
  parts.push('<path d="' + path + '" fill="none" stroke="' + style.stroke + '" stroke-opacity="' +
    style.strokeOpacity + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>');
}

function appendFrozenPolygon(rings, style, parts) {
  var path = (rings || []).map(function(ring) {
    return frozenSvgPathForCoords(ring, true);
  }).filter(Boolean).join(' ');
  if (!path) return;
  parts.push('<path d="' + path + '" fill="' + style.fill + '" fill-opacity="' + style.fillOpacity +
    '" fill-rule="evenodd" stroke="' + style.stroke + '" stroke-opacity="' + style.strokeOpacity +
    '" stroke-width="1.6" stroke-linejoin="round"/>');
}

function appendFrozenPoint(coord, style, parts) {
  if (!coord || coord.length < 2) return;
  var p = map.project([Number(coord[0]), Number(coord[1])]);
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
  parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
    '" r="5" fill="' + (style.circle || style.stroke) + '" fill-opacity="0.92" stroke="#fff" stroke-width="1.5"/>');
}

function activeFrozenFeatureLayerIds() {
  var ids = [];
  sharedActiveIds.forEach(function(patchId) {
    var state = PL()[patchId];
    if (!state || !state.ids) return;
    ['fillLayer', 'lineLayer', 'circleLayer'].forEach(function(key) {
      if (map.getLayer(state.ids[key])) ids.push(state.ids[key]);
    });
  });
  return ids;
}

function setFeatureLayersVisibility(visible) {
  frozenFeatureLayerVisibility = [];
  activeFrozenFeatureLayerIds().forEach(function(layerId) {
    var current = map.getLayoutProperty(layerId, 'visibility') || 'visible';
    frozenFeatureLayerVisibility.push({ id: layerId, visibility: current });
    map.setLayoutProperty(layerId, 'visibility', visible ? current : 'none');
  });
}

function restoreFeatureLayersVisibility() {
  frozenFeatureLayerVisibility.forEach(function(entry) {
    if (map.getLayer(entry.id)) {
      map.setLayoutProperty(entry.id, 'visibility', entry.visibility || 'visible');
    }
  });
  frozenFeatureLayerVisibility = [];
}

function clearFrozenFeatureOverlay() {
  if (frozenFeatureOverlay && frozenFeatureOverlay.parentNode) {
    frozenFeatureOverlay.parentNode.removeChild(frozenFeatureOverlay);
  }
  frozenFeatureOverlay = null;
  frozenFeatureAnchorLngLat = null;
  frozenFeatureAnchorPixel = null;
}

function invalidateFrozenFeatureOverlay() {
  if (!ENABLE_FROZEN_FEATURE_DRAG) return;
  frozenFeatureBuildSeq += 1;
  frozenFeatureBuildScheduled = false;
  if (!frozenFeatureDragging) clearFrozenFeatureOverlay();
}

function scheduleFrozenFeatureOverlayBuild(delay) {
  if (!ENABLE_FROZEN_FEATURE_DRAG) return;
  if (frozenFeatureDragging || frozenFeatureBuildScheduled) return;
  if (!sharedActiveIds.size) {
    invalidateFrozenFeatureOverlay();
    return;
  }
  frozenFeatureBuildScheduled = true;
  var seq = frozenFeatureBuildSeq;
  var schedule = window.requestIdleCallback || function(fn) {
    return window.setTimeout(fn, delay == null ? 180 : delay);
  };
  schedule(function() {
    frozenFeatureBuildScheduled = false;
    if (frozenFeatureDragging || seq !== frozenFeatureBuildSeq) return;
    buildFrozenFeatureOverlay(false);
  }, { timeout: delay == null ? 400 : Math.max(80, delay) });
}

function buildFrozenFeatureOverlay() {
  clearFrozenFeatureOverlay();
  var extent = paddedMapBoundsExtent();
  if (!extent) return false;
  var rect = map.getContainer().getBoundingClientRect();
  var svgParts = [];
  sharedActiveIds.forEach(function(patchId) {
    var state = PL()[patchId];
    if (!state || !state.features || !patchFeatureLayersReady(state)) return;
    (state.features || []).forEach(function(feature) {
      if (!feature || isFeatureHidden(patchId, feature._featureIdx)) return;
      if (!extentsIntersect(featureBoundsForFreeze(feature), extent)) return;
      var type = feature.properties && feature.properties._styleType
        ? feature.properties._styleType
        : (feature._styleType || getOSMType(feature.properties || {}));
      appendFrozenGeometry(feature.geometry, frozenFeatureStyle(type), svgParts);
    });
  });
  if (!svgParts.length) return false;
  frozenFeatureOverlay = document.createElement('div');
  frozenFeatureOverlay.id = 'maplibre-frozen-feature-overlay';
  frozenFeatureOverlay.style.position = 'absolute';
  frozenFeatureOverlay.style.left = '0';
  frozenFeatureOverlay.style.top = '0';
  frozenFeatureOverlay.style.right = '0';
  frozenFeatureOverlay.style.bottom = '0';
  frozenFeatureOverlay.style.zIndex = '5';
  frozenFeatureOverlay.style.pointerEvents = 'none';
  frozenFeatureOverlay.style.willChange = 'transform';
  frozenFeatureOverlay.style.display = frozenFeatureDragging ? 'block' : 'none';
  frozenFeatureOverlay.innerHTML = '<svg width="' + Math.max(1, rect.width).toFixed(0) +
    '" height="' + Math.max(1, rect.height).toFixed(0) +
    '" viewBox="0 0 ' + Math.max(1, rect.width).toFixed(0) + ' ' + Math.max(1, rect.height).toFixed(0) +
    '" style="position:absolute;inset:0;overflow:visible;pointer-events:none;">' + svgParts.join('') + '</svg>';
  map.getContainer().appendChild(frozenFeatureOverlay);
  frozenFeatureAnchorLngLat = map.getCenter();
  frozenFeatureAnchorPixel = map.project(frozenFeatureAnchorLngLat);
  return true;
}

function updateFrozenFeatureOverlayTransform() {
  if (!frozenFeatureOverlay || !frozenFeatureAnchorLngLat || !frozenFeatureAnchorPixel) return;
  var p = map.project(frozenFeatureAnchorLngLat);
  var dx = p.x - frozenFeatureAnchorPixel.x;
  var dy = p.y - frozenFeatureAnchorPixel.y;
  frozenFeatureOverlay.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
}

function beginFrozenFeatureDrag() {
  if (!ENABLE_FROZEN_FEATURE_DRAG) return;
  frozenFeatureDragging = true;
  if (frozenFeatureRestoreTimer) {
    window.clearTimeout(frozenFeatureRestoreTimer);
    frozenFeatureRestoreTimer = 0;
  }
  if (!frozenFeatureOverlay) return;
  frozenFeatureOverlay.style.display = 'block';
  updateFrozenFeatureOverlayTransform();
  setFeatureLayersVisibility(false);
}

function endFrozenFeatureDrag() {
  if (!ENABLE_FROZEN_FEATURE_DRAG) return;
  frozenFeatureDragging = false;
  if (frozenFeatureRestoreTimer) window.clearTimeout(frozenFeatureRestoreTimer);
  frozenFeatureRestoreTimer = window.setTimeout(function() {
    frozenFeatureRestoreTimer = 0;
    restoreFeatureLayersVisibility();
    if (map.triggerRepaint) map.triggerRepaint();
    window.requestAnimationFrame(function() {
      clearFrozenFeatureOverlay();
      invalidateFrozenFeatureOverlay();
      scheduleFrozenFeatureOverlayBuild(220);
    });
  }, 40);
}

function pointToFeatureScore(lngLat, feature) {
  var extent = feature && feature._bounds;
  if (!extent) return Infinity;
  var pad = 0.00008;
  if (lngLat.lng < extent[0] - pad || lngLat.lng > extent[2] + pad ||
      lngLat.lat < extent[1] - pad || lngLat.lat > extent[3] + pad) return Infinity;
  if (window.turf && feature.geometry) {
    var pt = turf.point([lngLat.lng, lngLat.lat]);
    var geomType = feature.geometry.type;
    try {
      if (geomType.indexOf('Polygon') !== -1 && turf.booleanPointInPolygon(pt, feature)) return 0;
      if (geomType.indexOf('LineString') !== -1) return turf.pointToLineDistance(pt, feature, { units: 'meters' });
    } catch (_err) {}
  }
  var center = extentCenter(extent);
  var dLat = (lngLat.lat - center[1]) * 111320;
  var dLng = (lngLat.lng - center[0]) * 111320 * Math.cos(lngLat.lat * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function findFeatureAtLngLat(lngLat) {
  var best = null;
  sharedActiveIds.forEach(function(patchId) {
    var state = PL()[patchId];
    if (!state || !state.features) return;
    for (var i = 0; i < state.features.length; i += 1) {
      var feature = state.features[i];
      var score = pointToFeatureScore(lngLat, feature);
      if (isFinite(score) && (!best || score < best.score)) {
        best = { patchId: patchId, feature: feature, score: score };
      }
    }
  });
  return best && best.score < 20 ? best : null;
}

function featureRenderSize(feature) {
  var extent = feature && feature._bounds;
  if (!extent) return Infinity;
  var geomType = feature.geometry && feature.geometry.type ? feature.geometry.type : '';
  if (geomType === 'Point' || geomType === 'MultiPoint') return -1;
  var span = projectedExtentSpan(extent);
  if (geomType === 'LineString' || geomType === 'MultiLineString') return span;
  return span * span;
}

function activeFeatureLayerIds() {
  var ids = [];
  sharedActiveIds.forEach(function(patchId) {
    var state = PL()[patchId];
    if (!state || !state.ids) return;
    ['circleLayer', 'lineLayer', 'fillLayer'].forEach(function(key) {
      if (map.getLayer(state.ids[key])) ids.push(state.ids[key]);
    });
  });
  return ids;
}

function findRenderedFeatureAtPoint(point) {
  if (!map.queryRenderedFeatures) return null;
  var layerIds = activeFeatureLayerIds();
  if (!layerIds.length) return null;
  var tolerance = 10;
  var rendered = map.queryRenderedFeatures(
    [[point.x - tolerance, point.y - tolerance], [point.x + tolerance, point.y + tolerance]],
    { layers: layerIds }
  );
  var best = null;
  rendered.forEach(function(renderedFeature) {
    var props = renderedFeature.properties || {};
    var idx = Number(props._featureIdx);
    if (!isFinite(idx)) return;
    var patchId = null;
    Object.keys(PL()).some(function(id) {
      var state = PL()[id];
      if (!state || !state.ids) return false;
      if (renderedFeature.layer &&
          (renderedFeature.layer.id === state.ids.circleLayer ||
           renderedFeature.layer.id === state.ids.lineLayer ||
           renderedFeature.layer.id === state.ids.fillLayer)) {
        patchId = id;
        return true;
      }
      return false;
    });
    var state = patchId ? PL()[patchId] : null;
    var raw = state && state.features ? state.features[idx] : null;
    if (!raw || isFeatureHidden(patchId, idx)) return;
    var size = featureRenderSize(raw);
    if (!best || size < best.size) best = { patchId: patchId, feature: raw, size: size };
  });
  return best;
}

function isPatchMarkerDomEvent(event) {
  var target = event && event.target;
  return !!(
    target &&
    target.closest &&
    (
      target.closest('.osm-patch-marker') ||
      target.closest('.maplibregl-popup') ||
      target.closest('.maplibre-popup-button')
    )
  );
}

function mapPointFromDomEvent(event) {
  var source = event && event.touches && event.touches.length ? event.touches[0] : event;
  if (!source || source.clientX == null || source.clientY == null || !map.getContainer) return null;
  var rect = map.getContainer().getBoundingClientRect();
  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top
  };
}

function suppressFeatureNavigationDomEvent(event) {
  if (!featureNavigationTargetKey || isPatchMarkerDomEvent(event)) return false;
  var now = performance.now ? performance.now() : Date.now();
  if (now > featureNavigationSuppressUntil) return false;
  var point = mapPointFromDomEvent(event);
  if (!point) return false;
  var hit = findRenderedFeatureAtPoint(point);
  if (!hit && map.unproject) {
    hit = findFeatureAtLngLat(map.unproject([point.x, point.y]));
  }
  if (!hit || !isFeatureNavigationRepeatClick(hit.patchId, hit.feature)) return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  return true;
}

function installFeatureNavigationClickSuppressor() {
  var container = map && map.getContainer ? map.getContainer() : null;
  if (!container || container._featureNavigationSuppressorInstalled) return;
  container._featureNavigationSuppressorInstalled = true;
  ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick'].forEach(function(type) {
    container.addEventListener(type, suppressFeatureNavigationDomEvent, { capture: true, passive: false });
  });
}

map.on('click', function(e) {
  if (isPatchMarkerPointerEvent(e)) return;
  var hit = findRenderedFeatureAtPoint(e.point) || findFeatureAtLngLat(e.lngLat);
  if (!hit) {
    clearSelectedFeatureFlash();
    clearDetailFeatureSearch();
    return;
  }
  selectRawFeatureInDetail(hit.patchId, hit.feature, getFeatureId(hit.feature), { updateSearch: true });
});
map.on('dragstart', function() {
  beginFrozenFeatureDrag();
});
map.on('drag', function() {
  updateFrozenFeatureOverlayTransform();
});
map.on('dragend', function() {
  endFrozenFeatureDrag();
});
map.on('move', function() {
  renderSelectedFeatureOverlay();
});
map.on('zoom', function() {
  renderSelectedFeatureOverlay();
});
map.on('moveend', function() {
  if (frozenFeatureDragging || frozenFeatureRestoreTimer) return;
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
});
map.on('resize', function() {
  renderSelectedFeatureOverlay();
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
});
