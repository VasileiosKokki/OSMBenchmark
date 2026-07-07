// This file is concatenated by visualize_osm/app/main.py.
function prepareFeatureCache(features, backend) {
  var counts = {};
  var groups = {};
  (features || []).forEach(function(feature, idx) {
    var type = getOSMType(feature.properties);
    var value = getOSMValue(feature.properties);
    var id = getFeatureId(feature, backend);
    feature._featureIdx = idx;
    feature.properties = feature.properties || {};
    feature.properties._featureIdx = idx;
    feature._featureId = id;
    feature._bounds = featureExtent(feature);
    feature.properties._styleType = type;
    feature._row = {
      id: id,
      idLower: id.toLowerCase(),
      value: value,
      type: type,
      geomType: feature.geometry && feature.geometry.type ? feature.geometry.type : ''
    };
    counts[type] = (counts[type] || 0) + 1;
    if (!groups[type]) groups[type] = [];
    groups[type].push(idx);
  });
  return {
    features: features || [],
    prepared: {
      counts: counts,
      groups: groups,
      summaryHtml: Object.entries(counts).sort().map(function(e) {
        var label = escapeHtml(e[0] + ' x' + e[1]);
        return '<button type="button" class="osm-badge" data-type="' + escapeHtml(e[0]) +
          '" title="Toggle ' + label + '">' + label + '</button>';
      }).join('')
    }
  };
}

function loadFeatures(meta, backend) {
  if (!meta || !meta.url) return Promise.resolve({ features: [], counts: {} });
  if (!window.Worker) {
    return fetch(meta.url, { cache: 'no-store' }).then(function(response) {
      if (!response.ok) throw new Error('Feature load failed: ' + response.status);
      return response.json();
    }).then(function(data) {
      var features = data.features || [];
      features.sort(function(a, b) { return getOSMType(a.properties).localeCompare(getOSMType(b.properties)); });
      return prepareFeatureCache(features, backend);
    }).catch(function(err) {
      console.warn('Could not load features', err);
      return { features: [], prepared: { counts: {}, groups: {}, summaryHtml: '' } };
    });
  }

  return new Promise(function(resolve, reject) {
    var worker = new Worker('app/client/feature_worker.js?v=' + encodeURIComponent(FEATURE_WORKER_VERSION));
    var requestId = ++featureWorkerSeq;
    var features = [];
    var prepared = null;
    var expectedTotal = null;
    var receivedTotal = 0;
    var pendingChunks = [];
    var chunkDrainScheduled = false;
    var loadedMessage = null;
    var settled = false;

    function nowMs() {
      return performance.now ? performance.now() : Date.now();
    }

    function acknowledgeFeatureChunk() {
      if (settled) return;
      worker.postMessage({ type: 'features-chunk-ack', requestId: requestId });
    }

    function finishLoadedFeatures() {
      if (settled || !loadedMessage || pendingChunks.length) return;
      settled = true;
      worker.terminate();
      if (expectedTotal === null) expectedTotal = receivedTotal;
      if (features.length > expectedTotal) features.length = expectedTotal;
      resolve({
        features: features,
        prepared: prepared || prepareFeatureCache(features, backend)
      });
    }

    function processFeatureChunk(msg) {
      var start = msg.start || 0;
      var chunk = msg.features || [];
      for (var i = 0; i < chunk.length; i += 1) {
        features[start + i] = chunk[i];
      }
      receivedTotal += chunk.length;
      acknowledgeFeatureChunk();
    }

    function scheduleFeatureChunkDrain(delay) {
      if (settled || chunkDrainScheduled) return;
      chunkDrainScheduled = true;
      if (delay && delay > 0) {
        window.setTimeout(drainFeatureChunks, delay);
      } else {
        window.requestAnimationFrame(function() { drainFeatureChunks(); });
      }
    }

    function drainFeatureChunks() {
      chunkDrainScheduled = false;
      if (settled) return;
      if (!pendingChunks.length) {
        finishLoadedFeatures();
        return;
      }
      var startedAt = nowMs();
      do {
        processFeatureChunk(pendingChunks.shift());
      } while (pendingChunks.length && nowMs() - startedAt < 8);

      if (pendingChunks.length) {
        scheduleFeatureChunkDrain(0);
      } else {
        finishLoadedFeatures();
      }
    }

    worker.onmessage = function(event) {
      var msg = event.data || {};
      if (msg.requestId !== requestId) return;
      if (msg.type === 'features-summary') {
        prepared = msg.prepared || null;
        expectedTotal = msg.total || 0;
        features.length = expectedTotal;
        return;
      }
      if (msg.type === 'features-chunk') {
        pendingChunks.push(msg);
        scheduleFeatureChunkDrain(0);
        return;
      }
      if (msg.type === 'features-loaded') {
        loadedMessage = msg;
        finishLoadedFeatures();
      } else {
        settled = true;
        worker.terminate();
        reject(new Error(msg.error || 'Feature worker failed'));
      }
    };

    worker.onerror = function(err) {
      settled = true;
      worker.terminate();
      reject(err);
    };

    worker.postMessage({
      type: 'load-features',
      requestId: requestId,
      url: meta.url,
      backend: backend,
      chunkSize: FEATURE_WORKER_CHUNK_SIZE
    });
  }).catch(function(err) {
    console.warn('Could not load features', err);
    return { features: [], prepared: { counts: {}, groups: {}, summaryHtml: '' } };
  });
}

function safeId(parts) {
  return parts.map(function(part) {
    return String(part).replace(/[^A-Za-z0-9_-]/g, '_');
  }).join('-');
}

function patchIds(backend, patchId) {
  var base = safeId(['ml', backend, patchId]);
  return {
    featureSource: base + '-feature-source',
    fillLayer: base + '-fill-layer',
    lineLayer: base + '-line-layer',
    circleLayer: base + '-circle-layer',
    bboxSource: base + '-bbox-source',
    bboxLayer: base + '-bbox-layer'
  };
}

function styleMatch(propertyName, fallback, pairs) {
  var expr = ['match', ['get', propertyName]];
  pairs.forEach(function(pair) {
    expr.push(pair[0], pair[1]);
  });
  expr.push(fallback);
  return expr;
}

function ensureMapLibreFeatureProperties(feature) {
  if (!feature) return feature;
  feature.properties = feature.properties || {};
  if (feature.properties._styleType == null) {
    feature.properties._styleType = feature._styleType || getOSMType(feature.properties);
  }
  if (feature.properties._featureIdx == null && feature._featureIdx != null) {
    feature.properties._featureIdx = feature._featureIdx;
  }
  return feature;
}

function visibleFeatureCollection(state) {
  var hidden = hiddenFeatureIds[String(state.patchId)];
  var features = (state.features || []).filter(function(feature) {
    return !hidden || !hidden.has(feature._featureIdx);
  }).map(function(feature) {
    return ensureMapLibreFeatureProperties(feature);
  });
  return { type: 'FeatureCollection', features: features };
}

function setPatchFeatureSourceData(state) {
  if (!state || !state.ids || !map.getStyle()) return false;
  var source = map.getSource(state.ids.featureSource);
  if (!source || !source.setData) return false;
  source.setData(visibleFeatureCollection(state));
  if (map.triggerRepaint) map.triggerRepaint();
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
  return true;
}

function queuePatchFeatureSourceRefresh(state, attempts) {
  if (!state || !state.ids) return;
  state.featureSourceRefreshSeq = (state.featureSourceRefreshSeq || 0) + 1;
  var seq = state.featureSourceRefreshSeq;
  attempts = attempts == null ? 5 : attempts;
  function refresh(remaining) {
    if (seq !== state.featureSourceRefreshSeq) return;
    if (!sharedActiveIds.has(String(state.patchId))) return;
    var updated = setPatchFeatureSourceData(state);
    if (updated && patchFeatureLayersReady(state)) return;
    addPatchLayers(String(state.patchId), state);
    if (patchFeatureLayersReady(state)) return;
    if (remaining <= 0) return;
    window.setTimeout(function() { refresh(remaining - 1); }, remaining === attempts ? 80 : 180);
  }
  window.requestAnimationFrame(function() { refresh(attempts); });
  if (map.once) {
    map.once('idle', function() { refresh(Math.max(0, attempts - 1)); });
  }
}

function updatePatchFeatureSource(state, options) {
  if (!state || !state.ids) return;
  if (!map.getStyle()) {
    if (options && options.retry) queuePatchFeatureSourceRefresh(state);
    return;
  }
  var updated = setPatchFeatureSourceData(state);
  if (!updated || !patchFeatureLayersReady(state)) {
    addPatchLayers(String(state.patchId), state);
    if (options && options.retry && !patchFeatureLayersReady(state)) queuePatchFeatureSourceRefresh(state);
  }
}

function schedulePatchFeatureSourceUpdate(state, options) {
  if (!state || !state.ids) return;
  state.deferredFeatureSourceSeq = (state.deferredFeatureSourceSeq || 0) + 1;
  var seq = state.deferredFeatureSourceSeq;
  function apply() {
    if (seq !== state.deferredFeatureSourceSeq) return;
    if (!sharedActiveIds.has(String(state.patchId))) return;
    state.deferredFeatureSourceTimer = 0;
    updatePatchFeatureSource(state, options);
  }
  if (state.deferredFeatureSourceTimer) {
    window.clearTimeout(state.deferredFeatureSourceTimer);
  }
  state.deferredFeatureSourceTimer = window.setTimeout(apply, 0);
}

function patchFeatureLayersReady(state) {
  if (!state || !state.ids || !map.getStyle()) return false;
  return !!(
    map.getSource(state.ids.featureSource) &&
    map.getLayer(state.ids.fillLayer) &&
    map.getLayer(state.ids.lineLayer) &&
    map.getLayer(state.ids.circleLayer) &&
    map.getSource(state.ids.bboxSource) &&
    map.getLayer(state.ids.bboxLayer)
  );
}

function whenMapReady(cb) {
  var attempts = 8;
  var done = false;
  function tryRun(remaining) {
    if (done) return;
    if (!map.getStyle || !map.getStyle()) {
      schedule(remaining);
      return;
    }
    try {
      cb();
      done = true;
    } catch (err) {
      if (remaining <= 0) {
        console.warn('MapLibre style operation failed', err);
        return;
      }
      schedule(remaining - 1);
    }
  }
  function schedule(remaining) {
    if (remaining < 0 || done) return;
    if (map.once) {
      map.once('load', function() { tryRun(remaining); });
      map.once('styledata', function() { tryRun(remaining); });
      map.once('idle', function() { tryRun(remaining); });
    }
    window.setTimeout(function() { tryRun(remaining); }, remaining === attempts ? 40 : 160);
  }
  if (map.loaded() || map.isStyleLoaded() || (map.getStyle && map.getStyle())) {
    window.requestAnimationFrame(function() { tryRun(attempts); });
  } else {
    schedule(attempts);
  }
}

function addPatchLayers(id, state) {
  whenMapReady(function() {
    var ids = state.ids;
    var bbox = state.meta && state.meta.bbox;
    if (!bbox) return;

    var bboxPolygon = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]],
          [bbox[0], bbox[3]], [bbox[0], bbox[1]]
        ]]
      },
      properties: {}
    };
    if (!map.getSource(ids.bboxSource)) {
      map.addSource(ids.bboxSource, { type: 'geojson', data: bboxPolygon });
    }
    if (map.getSource(ids.bboxSource) && !map.getLayer(ids.bboxLayer)) {
      map.addLayer({
        id: ids.bboxLayer,
        type: 'line',
        source: ids.bboxSource,
        paint: {
          'line-color': '#2979ff',
          'line-width': 1.25,
          'line-opacity': 0.85
        }
      });
    }

    if (state.loading) {
      moveSelectedFeatureLayersToTop();
      return;
    }

    if (!map.getSource(ids.featureSource)) {
      map.addSource(ids.featureSource, {
        type: 'geojson',
        data: visibleFeatureCollection(state),
        maxzoom: 22,
        tolerance: MAPLIBRE_FEATURE_SOURCE_TOLERANCE,
        buffer: 128
      });
    } else {
      setPatchFeatureSourceData(state);
    }

    if (map.getSource(ids.featureSource) && !map.getLayer(ids.fillLayer)) {
      map.addLayer({
        id: ids.fillLayer,
        type: 'fill',
        source: ids.featureSource,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': styleMatch('_styleType', '#bbbbbb', [
            ['building', '#888888'],
            ['landuse', '#66cc66'],
            ['natural', '#228833'],
            ['water', '#4da6ff'],
            ['amenity', '#cc44aa'],
            ['leisure', '#00cc44'],
            ['shop', '#ff9900'],
            ['tourism', '#ff6688']
          ]),
          'fill-opacity': styleMatch('_styleType', 0.06, [
            ['building', 0.15],
            ['landuse', 0.14],
            ['natural', 0.13],
            ['water', 0.28],
            ['amenity', 0.12],
            ['leisure', 0.14],
            ['shop', 0.12],
            ['tourism', 0.12]
          ])
        }
      });
    }
    if (map.getSource(ids.featureSource) && !map.getLayer(ids.lineLayer)) {
      map.addLayer({
        id: ids.lineLayer,
        type: 'line',
        source: ids.featureSource,
        paint: {
          'line-color': styleMatch('_styleType', '#bbbbbb', [
            ['building', '#555555'],
            ['highway', '#ff9900'],
            ['landuse', '#66cc66'],
            ['natural', '#228833'],
            ['water', '#4da6ff'],
            ['waterway', '#4da6ff'],
            ['amenity', '#cc44aa'],
            ['leisure', '#00cc44'],
            ['shop', '#ff9900'],
            ['tourism', '#ff6688']
          ]),
          'line-opacity': styleMatch('_styleType', 0.62, [
            ['building', 0.48],
            ['landuse', 0.62],
            ['natural', 0.66],
            ['water', 0.76],
            ['waterway', 0.9],
            ['highway', 0.9]
          ]),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.65, 14, 1.35, 19, 2.6]
        }
      });
    }
    if (map.getSource(ids.featureSource) && !map.getLayer(ids.circleLayer)) {
      map.addLayer({
        id: ids.circleLayer,
        type: 'circle',
        source: ids.featureSource,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3, 16, 6, 20, 10],
          'circle-color': styleMatch('_styleType', '#bbbbbb', [
            ['natural', '#228833'],
            ['amenity', '#cc44aa'],
            ['shop', '#ff9900'],
            ['tourism', '#ff6688'],
            ['water', '#4da6ff']
          ]),
          'circle-opacity': 0.92,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 16, 2, 20, 3]
        }
      });
    }
    invalidateFrozenFeatureOverlay();
    scheduleFrozenFeatureOverlayBuild(260);
    moveSelectedFeatureLayersToTop();
  });
}

function removePatchLayers(state) {
  if (!state || !state.ids || !map.getStyle()) return;
  ['circleLayer', 'lineLayer', 'fillLayer', 'bboxLayer'].forEach(function(key) {
    if (map.getLayer(state.ids[key])) map.removeLayer(state.ids[key]);
  });
  ['featureSource', 'bboxSource'].forEach(function(key) {
    if (map.getSource(state.ids[key])) map.removeSource(state.ids[key]);
  });
  invalidateFrozenFeatureOverlay();
}

function refreshPatchFeatureSource(state) {
  if (!state || !state.ids || !map.getStyle()) return;
  if (map.getSource(state.ids.featureSource)) updatePatchFeatureSource(state);
  else addPatchLayers(String(state.patchId), state);
}

function syncBtn(id) {
  var isActive = sharedActiveIds.has(String(id));
  document.querySelectorAll('button[data-patch="' + id + '"]').forEach(function(btn) {
    btn.innerHTML = '';
    btn.textContent = isActive ? 'Hide OSM Features' : 'Show OSM Features';
    btn.style.background = isActive ? '#1f7a39' : '#202632';
    btn.style.color = '#fff';
    btn.disabled = false;
  });
  activeMarkers.forEach(function(marker) {
    if (!marker || String(marker._patchId) !== String(id) || !marker.getPopup) return;
    marker.getPopup().setHTML(markerPopupHtml(id));
  });
}
