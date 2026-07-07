// This file is concatenated by visualize_osm/app/main.py.
function scheduleLoadedPatchUiRefresh(id) {
  id = String(id);
  var state = PL()[id];
  if (!state) return;
  state.loadedUiRefreshSeq = (state.loadedUiRefreshSeq || 0) + 1;
  var seq = state.loadedUiRefreshSeq;
  function apply() {
    if (seq !== state.loadedUiRefreshSeq) return;
    if (!sharedActiveIds.has(id)) return;
    renderUI();
  }
  window.setTimeout(apply, 0);
}

function loadPatch(id, onDone) {
  id = String(id);
  layers[activeBackend] = layers[activeBackend] || {};
  var meta = (ALL_META[activeBackend] || {})[id];
  if (!meta) { if (onDone) onDone(null); return; }

  var existing = layers[activeBackend][id];
  if (existing && existing.features && !existing.loading) {
    existing.active = true;
    sharedActiveIds.add(id);
    detailPanelMinimized = false;
    if (String(maximizedPatchId) !== id) saveCurrentFeatureSearch();
    maximizedPatchId = id;
    addPatchLayers(id, existing);
    syncBtn(id);
    renderUI();
    if (onDone) onDone(existing);
    return;
  }
  var state = existing || {
    patchId: id,
    backend: activeBackend,
    meta: meta,
    ids: patchIds(activeBackend, id),
    features: [],
    active: true,
    loading: true
  };
  layers[activeBackend][id] = state;

  sharedActiveIds.add(id);
  detailPanelMinimized = false;
  if (String(maximizedPatchId) !== id) saveCurrentFeatureSearch();
  maximizedPatchId = id;
  addPatchLayers(id, state);
  syncBtn(id);
  renderUI();
  loadFeatures(meta, activeBackend).then(function(result) {
    state.features = result.features || [];
    state.featureGroups = (result.prepared && result.prepared.groups) || {};
    state.typeCounts = (result.prepared && result.prepared.counts) || {};
    state.summaryHtml = (result.prepared && result.prepared.summaryHtml) || '';
    state.loading = false;
    schedulePatchFeatureSourceUpdate(state, { retry: true, initialRender: true });
    if (onDone) onDone(state);
    scheduleLoadedPatchUiRefresh(id);
  }).catch(function(err) {
    console.warn('Could not load features for patch', id, err);
    state.loading = false;
    if (onDone) onDone(null);
    renderUI();
  });
}

function removePatch(id) {
  id = String(id);
  var state = PL()[id];
  if (state) removePatchLayers(state);
  sharedActiveIds.delete(id);
  if (selectedFeaturePatchId === id) clearSelectedFeatureFlash();
  if (maximizedPatchId === id) maximizedPatchId = null;
  if (featureTableState && featureTableState.patchId === id) featureTableState = null;
  delete hiddenFeatureIds[id];
  delete toggleAllButtonModes[id];
  delete featureSearchByPatch[featureSearchKey(id)];
  syncBtn(id);
  renderUI();
}

function ensurePatchFeaturesVisible(id, onReady) {
  id = String(id);
  var state = PL()[id];
  if (state && sharedActiveIds.has(id)) {
    detailPanelMinimized = false;
    if (String(maximizedPatchId) !== id) saveCurrentFeatureSearch();
    maximizedPatchId = id;
    if (!patchFeatureLayersReady(state)) addPatchLayers(id, state);
    syncBtn(id);
    renderUI();
    if (onReady) onReady(state);
    return;
  }
  loadPatch(id, onReady);
}

function toggleGeoJSON(id) {
  id = String(id);
  if (sharedActiveIds.has(id)) removePatch(id);
  else ensurePatchFeaturesVisible(id);
}

function markerPopupHtml(patchId) {
  return '<button class="maplibre-popup-button" data-patch="' + escapeHtml(patchId) + '">' +
    (sharedActiveIds.has(String(patchId)) ? 'Hide OSM Features' : 'Show OSM Features') +
    '</button>';
}

function patchMarkerElement(color) {
  var fill = color || '#2979ff';
  var el = document.createElement('div');
  el.className = 'osm-patch-marker';
  el.style.width = '31px';
  el.style.height = '40px';
  el.innerHTML =
    '<svg class="osm-patch-pin-svg" xmlns="http://www.w3.org/2000/svg" width="31" height="40" viewBox="0 0 34 44" aria-hidden="true">' +
      '<path d="M17 2C8.72 2 2 8.72 2 17c0 10.6 15 25 15 25s15-14.4 15-25C32 8.72 25.28 2 17 2z" fill="' + escapeHtml(fill) + '" stroke="#fff" stroke-width="3"/>' +
      '<circle cx="17" cy="17" r="5.5" fill="#fff" fill-opacity=".95"/>' +
    '</svg>';
  return el;
}

function isPatchMarkerPointerEvent(e) {
  var target = e && e.originalEvent && e.originalEvent.target;
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

function clearMarkers() {
  activeMarkers.forEach(function(marker) { marker.remove(); });
  activeMarkers = [];
}

function buildMarkerGroup(backend) {
  clearMarkers();
  var markers = LAZY_MARKERS[backend] || [];
  if (!Array.isArray(markers)) {
    markers = Object.keys(markers).map(function(id) {
      var marker = markers[id] || {};
      if (marker.patch_id == null) marker.patch_id = id;
      return marker;
    });
  }
  markers.forEach(function(m) {
    var id = String(m && m.patch_id != null ? m.patch_id : '');
    if (!m || !isFinite(m.lat) || !isFinite(m.lon)) return;
    if (!id || !(ALL_META[backend] || {})[id]) return;
    var popup = new maplibregl.Popup({ offset: 28 }).setHTML(markerPopupHtml(id));
    var marker = new maplibregl.Marker({
      element: patchMarkerElement(BACKEND_COLORS[backend] || '#2979ff'),
      anchor: 'bottom'
    }).setLngLat([m.lon, m.lat]).setPopup(popup).addTo(map);
    marker._patchId = id;
    popup.on('open', function() {
      popup.setHTML(markerPopupHtml(id));
    });
    marker.getElement().addEventListener('click', function() {
      focusPatchMetaFromMarker((ALL_META[backend] || {})[id], PATCH_FOCUS_MAX_ZOOM);
    });
    activeMarkers.push(marker);
  });
  markerGroups[backend] = activeMarkers;
}

document.addEventListener('click', function(e) {
  var groupBadge = e.target.closest('.osm-badge[data-group-type]');
  if (groupBadge) {
    e.preventDefault();
    e.stopPropagation();
    toggleFeatureGroup(groupBadge.dataset.patch, groupBadge.dataset.groupType);
    return;
  }
  var row = e.target.closest('tr.osm-feat-row');
  if (row && !e.target.closest('button')) {
    e.preventDefault();
    e.stopPropagation();
    var patchId = row.dataset.patch;
    var state = PL()[patchId];
    var idx = Number(row.dataset.idx);
    var feature = state && state.features ? state.features[idx] : null;
    if (feature) selectRawFeatureInDetail(patchId, feature, getFeatureId(feature), { updateSearch: false });
    return;
  }
  var btn = e.target.closest('button[data-patch]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  toggleGeoJSON(btn.dataset.patch);
});
