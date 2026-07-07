// This file is concatenated by visualize_osm/app/main.py.
var PATCH_LOOKUP = {};
Object.keys(ALL_META).forEach(function(backend) {
  Object.entries(ALL_META[backend] || {}).forEach(function(entry) {
    var id = entry[0], m = entry[1];
    PATCH_LOOKUP[id] = id;
    if (m && m.fn) {
      var stem = m.fn.replace(/\.[^/.]+$/, '');
      PATCH_LOOKUP[stem] = id;
      PATCH_LOOKUP[m.fn] = id;
    }
  });
});

function setPatchSearchLoading(loading) {
  var btn = document.getElementById('patch-search-btn');
  if (!btn) return;
  btn.disabled = !!loading;
  btn.innerHTML = loading ? '<span class="patch-search-spinner" aria-label="Loading"></span>' : 'Go';
}

function findLoadedFeatureById(featureId) {
  var normalizedId = normalizeFeatureId(featureId);
  var orderedPatchIds = Array.from(sharedActiveIds);
  Object.keys(PL()).forEach(function(patchId) {
    if (!orderedPatchIds.includes(patchId)) orderedPatchIds.push(patchId);
  });
  for (var p = 0; p < orderedPatchIds.length; p += 1) {
    var patchId = orderedPatchIds[p];
    var state = PL()[patchId];
    if (!state || !state.features) continue;
    for (var i = 0; i < state.features.length; i += 1) {
      var feature = state.features[i];
      if (getFeatureId(feature) === normalizedId) {
        return { patchId: patchId, feature: feature };
      }
    }
  }
  return null;
}

function searchPatch() {
  var input = document.getElementById('patch-search-input');
  var q = input ? input.value.trim() : '';
  var type = document.getElementById('patch-search-type').value;
  var msg = document.getElementById('patch-search-msg');
  if (msg) msg.textContent = '';
  if (!q) return;

  if (type === 'patch') {
    var stem = q.replace(/\.tif$/i, '');
    if (!stem.startsWith('patch_')) stem = 'patch_' + stem;
    var hit = PATCH_LOOKUP[stem] || PATCH_LOOKUP[stem + '.tif'];
    if (!hit) {
      if (msg) msg.textContent = stem + ' not found.';
      return;
    }
    var meta = (ALL_META[activeBackend] || {})[hit];
    if (meta) focusPatchMeta(meta, PATCH_FOCUS_MAX_ZOOM);
    ensurePatchFeaturesVisible(hit);
    return;
  }

  if (type === 'osm') {
    var osmId = q.replace(/^osm_/i, '');
    var osmMeta = (ALL_META[activeBackend] || {})[osmId];
    if (!osmMeta) {
      if (msg) msg.textContent = 'OSM patch not found';
      return;
    }
    focusPatchMeta(osmMeta, PATCH_FOCUS_MAX_ZOOM);
    ensurePatchFeaturesVisible(osmId);
    return;
  }

  if (type === 'feature') {
    var featureQuery = normalizeFeatureId(q);
    var loadedHit = findLoadedFeatureById(featureQuery);
    if (loadedHit) {
      selectRawFeatureInDetail(loadedHit.patchId, loadedHit.feature, getFeatureId(loadedHit.feature));
      return;
    }

    setPatchSearchLoading(true);
    fetch('/api/backends/' + encodeURIComponent(activeBackend) + '/features/search?id=' + encodeURIComponent(featureQuery), {
      cache: 'no-store'
    }).then(function(response) {
      if (!response.ok) throw new Error('Feature not found');
      return response.json();
    }).then(function(result) {
      if (!result || !result.patch_id) throw new Error('Feature not found');
      var patchId = String(result.patch_id);
      var raw = result.feature || null;
      if (raw) {
        focusRawFeature(raw, patchId);
        flashFeatureOnMap(patchId, raw);
        ensurePatchFeaturesVisible(patchId, function(state) {
          var rawId = normalizeFeatureId(result.feature_id || featureQuery);
          var loaded = state && (state.features || []).find(function(feature) { return getFeatureId(feature) === rawId; });
          selectRawFeatureInDetail(patchId, loaded || raw, getFeatureId(loaded || raw), {
            skipFocus: true,
            skipFlash: true
          });
        });
      } else {
        ensurePatchFeaturesVisible(patchId, function(state) {
          var rawId = normalizeFeatureId(result.feature_id || featureQuery);
          var found = (state.features || []).find(function(feature) { return getFeatureId(feature) === rawId; });
          if (found) selectRawFeatureInDetail(patchId, found, getFeatureId(found));
        });
      }
    }).catch(function(err) {
      if (msg) msg.textContent = err.message || 'Feature not found';
    }).finally(function() {
      setPatchSearchLoading(false);
    });
  }
}

function selectBackend(newBackend) {
  if (!newBackend || newBackend === activeBackend) return;
  saveCurrentFeatureSearch();
  var openIds = Array.from(sharedActiveIds);
  openIds.forEach(function(id) {
    var oldState = layers[activeBackend] && layers[activeBackend][id];
    removePatchLayers(oldState);
  });
  sharedActiveIds.clear();
  clearSelectedFeatureFlash();
  activeBackend = newBackend;
  buildMarkerGroup(activeBackend);
  layers[activeBackend] = layers[activeBackend] || {};
  openIds.forEach(function(id) {
    if ((ALL_META[activeBackend] || {})[id]) ensurePatchFeaturesVisible(id);
  });
  renderUI();
}

function initSearchControls() {
  var searchType = document.getElementById('patch-search-type');
  if (searchType) {
    searchType.addEventListener('change', function() {
      var placeholders = {
        osm: 'e.g. 138',
        patch: 'e.g. patch_42219',
        feature: 'e.g. 518522718'
      };
      document.getElementById('patch-search-input').placeholder = placeholders[this.value] || placeholders.osm;
    });
  }
  var btn = document.getElementById('patch-search-btn');
  var input = document.getElementById('patch-search-input');
  if (btn) btn.addEventListener('click', searchPatch);
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') searchPatch();
    });
  }
}

map.on('zoomend', function() {
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
});

whenMapReady(function() {
  applyInitialMapLibreView();
  ensureUIShell();
  renderUI();
  buildMarkerGroup(activeBackend);
  initSearchControls();
  installFeatureNavigationClickSuppressor();
  startFpsCounter();
});
