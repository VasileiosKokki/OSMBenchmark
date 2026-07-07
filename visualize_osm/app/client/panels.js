// This file is concatenated by visualize_osm/app/main.py.
function savePanelSize() {
  try {
    localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(panelSize));
  } catch (err) {}
}

function isSidebarPanelVisible() {
  return sharedActiveIds.size > 0;
}

function isDetailPanelVisible() {
  return !detailPanelMinimized && !!maximizedPatchId && sharedActiveIds.has(maximizedPatchId);
}

function getMaxStackHeight(detailVisible, sidebarVisible) {
  var visibleCount = (detailVisible ? 1 : 0) + (sidebarVisible ? 1 : 0);
  var gapHeight = visibleCount > 1 ? PANEL_GAP : 0;
  return Math.max(0, window.innerHeight - PANEL_TOP_CLEARANCE - PANEL_BOTTOM_CLEARANCE - gapHeight);
}

function getPanelMaxHeight(panel, detailVisible, sidebarVisible) {
  var maxStackHeight = getMaxStackHeight(detailVisible, sidebarVisible);
  if (panel === 'detail') {
    var reservedSidebarHeight = sidebarVisible ? PANEL_HARD_MIN_SIDEBAR_HEIGHT : 0;
    return Math.max(0, maxStackHeight - reservedSidebarHeight);
  }
  var reservedDetailHeight = detailVisible ? PANEL_HARD_MIN_HEIGHT : 0;
  return Math.max(0, maxStackHeight - reservedDetailHeight);
}

function constrainPanelHeights(detailHeight, sidebarHeight, prefer, detailVisible, sidebarVisible) {
  var maxStackHeight = getMaxStackHeight(detailVisible, sidebarVisible);
  var minDetailHeight = detailVisible ? PANEL_HARD_MIN_HEIGHT : PANEL_MIN_HEIGHT;
  var minSidebarHeight = sidebarVisible ? PANEL_HARD_MIN_SIDEBAR_HEIGHT : PANEL_MIN_SIDEBAR_HEIGHT;
  if (detailVisible && sidebarVisible && minDetailHeight + minSidebarHeight > maxStackHeight) {
    var minTotal = minDetailHeight + minSidebarHeight;
    minDetailHeight = Math.floor(maxStackHeight * (minDetailHeight / minTotal));
    minSidebarHeight = maxStackHeight - minDetailHeight;
  }
  detailHeight = clampNumber(detailHeight || PANEL_DEFAULT_HEIGHT, minDetailHeight, getPanelMaxHeight('detail', detailVisible, sidebarVisible));
  sidebarHeight = clampNumber(sidebarHeight || PANEL_DEFAULT_SIDEBAR_HEIGHT, minSidebarHeight, getPanelMaxHeight('sidebar', detailVisible, sidebarVisible));
  if (!detailVisible) detailHeight = Math.max(PANEL_MIN_HEIGHT, detailHeight);
  if (!sidebarVisible) sidebarHeight = Math.max(PANEL_MIN_SIDEBAR_HEIGHT, sidebarHeight);
  if (!detailVisible || !sidebarVisible) {
    if (detailVisible) detailHeight = Math.min(detailHeight, maxStackHeight);
    if (sidebarVisible) sidebarHeight = Math.min(sidebarHeight, maxStackHeight);
    return { detailHeight: detailHeight, sidebarHeight: sidebarHeight };
  }
  var overflow = detailHeight + sidebarHeight - maxStackHeight;
  if (overflow > 0) {
    if (prefer === 'sidebar') {
      var detailReduction = Math.min(overflow, detailHeight - minDetailHeight);
      detailHeight -= detailReduction;
      overflow -= detailReduction;
      if (overflow > 0) sidebarHeight = Math.max(minSidebarHeight, sidebarHeight - overflow);
    } else {
      var sidebarReduction = Math.min(overflow, sidebarHeight - minSidebarHeight);
      sidebarHeight -= sidebarReduction;
      overflow -= sidebarReduction;
      if (overflow > 0) detailHeight = Math.max(minDetailHeight, detailHeight - overflow);
    }
  }
  return { detailHeight: detailHeight, sidebarHeight: sidebarHeight };
}

function setPanelHeights(detailHeight, sidebarHeight, prefer) {
  var constrained = constrainPanelHeights(detailHeight, sidebarHeight, prefer, isDetailPanelVisible(), isSidebarPanelVisible());
  panelSize.height = constrained.detailHeight;
  panelSize.sidebarHeight = constrained.sidebarHeight;
}

function resizeDetailFromBottom(drag, dy) {
  var sidebarHeight = Math.max(PANEL_HARD_MIN_SIDEBAR_HEIGHT, drag.sidebarHeight - dy);
  setPanelHeights(drag.height + dy, sidebarHeight, 'detail');
}

function applyPanelSize() {
  var shell = document.getElementById('osm-ui-shell');
  var detail = document.getElementById('osm-detail');
  var sidebar = document.getElementById('osm-sidebar');
  var maxWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, window.innerWidth - 48));
  var detailVisible = isDetailPanelVisible();
  var sidebarVisible = isSidebarPanelVisible();
  panelSize.width = clampNumber(panelSize.width, PANEL_MIN_WIDTH, maxWidth);
  var constrained = constrainPanelHeights(panelSize.height, panelSize.sidebarHeight || PANEL_DEFAULT_SIDEBAR_HEIGHT, 'detail', detailVisible, sidebarVisible);
  panelSize.height = constrained.detailHeight;
  panelSize.sidebarHeight = constrained.sidebarHeight;
  if (shell) shell.style.width = panelSize.width + 'px';
  if (detail) {
    detail.style.height = panelSize.height + 'px';
    detail.style.maxHeight = getPanelMaxHeight('detail', detailVisible, sidebarVisible) + 'px';
  }
  if (sidebar) sidebar.style.height = panelSize.sidebarHeight + 'px';
  renderVirtualFeatureRows();
}

function attachPanelResize(handle, panelName) {
  var drag = null;
  function cursorForDirection(dir) {
    if (dir === 'n' || dir === 's') return 'ns-resize';
    if (dir === 'e' || dir === 'w') return 'ew-resize';
    if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
    return 'nwse-resize';
  }
  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    drag = {
      x: e.clientX,
      y: e.clientY,
      width: panelSize.width,
      height: panelSize.height,
      sidebarHeight: panelSize.sidebarHeight,
      panel: panelName || 'detail',
      dir: handle.dataset.resizeDir || 'nw'
    };
    if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    document.body.classList.add('osm-panel-resizing');
    document.body.style.cursor = cursorForDirection(drag.dir);
  });
  window.addEventListener('pointermove', function(e) {
    if (!drag) return;
    var maxWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, window.innerWidth - 48));
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (drag.dir.indexOf('w') !== -1) panelSize.width = clampNumber(drag.width - dx, PANEL_MIN_WIDTH, maxWidth);
    if (drag.dir.indexOf('e') !== -1) panelSize.width = clampNumber(drag.width + dx, PANEL_MIN_WIDTH, maxWidth);
    if (drag.panel === 'detail' && drag.dir.indexOf('n') !== -1) setPanelHeights(drag.height - dy, drag.sidebarHeight, 'detail');
    if (drag.panel === 'detail' && drag.dir.indexOf('s') !== -1) resizeDetailFromBottom(drag, dy);
    if (drag.panel === 'sidebar' && drag.dir.indexOf('n') !== -1) setPanelHeights(drag.height, drag.sidebarHeight - dy, 'sidebar');
    applyPanelSize();
  });
  window.addEventListener('pointerup', function() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('osm-panel-resizing');
    document.body.style.cursor = '';
    savePanelSize();
  });
}

window.addEventListener('resize', applyPanelSize);

function ensureUIShell() {
  if (document.getElementById('osm-ui-shell')) return;
  var shell = document.createElement('div');
  shell.id = 'osm-ui-shell';
  function makeResizeHandle(dir, panelName) {
    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'osm-panel-resize-handle osm-resize-' + dir;
    resizeHandle.dataset.resizeDir = dir;
    resizeHandle.title = 'Resize panel';
    attachPanelResize(resizeHandle, panelName);
    return resizeHandle;
  }

  var detail = document.createElement('div');
  detail.id = 'osm-detail';
  ['n', 'w', 'nw', 's', 'sw'].forEach(function(dir) { detail.appendChild(makeResizeHandle(dir, 'detail')); });
  var detailHeader = document.createElement('div');
  detailHeader.id = 'osm-detail-header';
  var detailTitle = document.createElement('span');
  detailTitle.id = 'osm-detail-title';
  var toggleAllBtn = document.createElement('button');
  toggleAllBtn.id = 'osm-toggle-all-btn';
  toggleAllBtn.title = 'Show / hide all features';
  toggleAllBtn.textContent = 'Hide all';
  toggleAllBtn.addEventListener('click', function() {
    if (!maximizedPatchId) return;
    updateToggleAllBtn();
    var shouldShow = toggleAllButtonModes[String(maximizedPatchId)] === 'show';
    toggleAllFeatures(maximizedPatchId, shouldShow);
    updateToggleAllBtn();
  });
  var detailClose = document.createElement('button');
  detailClose.id = 'osm-detail-close';
  detailClose.title = 'Close detail';
  detailClose.textContent = 'x';
  detailClose.addEventListener('click', function() {
    detailPanelMinimized = true;
    featureTableState = null;
    renderUI();
  });
  detailHeader.appendChild(detailTitle);
  detailHeader.appendChild(toggleAllBtn);
  detailHeader.appendChild(detailClose);
  var searchBar = document.createElement('div');
  searchBar.id = 'osm-feat-search-bar';
  var searchInput = document.createElement('input');
  searchInput.id = 'osm-feat-search-input';
  searchInput.type = 'text';
  searchInput.placeholder = 'Search feature ID...';
  searchInput.addEventListener('input', function() { filterDetailRows(this.value.trim()); });
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      this.value = '';
      filterDetailRows('');
    }
  });
  var searchClear = document.createElement('button');
  searchClear.id = 'osm-feat-search-clear';
  searchClear.textContent = 'x';
  searchClear.title = 'Clear search';
  searchClear.addEventListener('click', function() {
    searchInput.value = '';
    filterDetailRows('');
  });
  searchBar.appendChild(searchInput);
  searchBar.appendChild(searchClear);
  var detailBody = document.createElement('div');
  detailBody.id = 'osm-detail-body';
  detail.appendChild(detailHeader);
  detail.appendChild(searchBar);
  detail.appendChild(detailBody);

  var sidebar = document.createElement('div');
  sidebar.id = 'osm-sidebar';
  ['n', 'w', 'nw'].forEach(function(dir) { sidebar.appendChild(makeResizeHandle(dir, 'sidebar')); });
  var sidebarHeader = document.createElement('div');
  sidebarHeader.id = 'osm-sidebar-header';
  sidebarHeader.textContent = 'Active patches';
  var sidebarList = document.createElement('div');
  sidebarList.id = 'osm-sidebar-list';
  sidebar.appendChild(sidebarHeader);
  sidebar.appendChild(sidebarList);

  shell.appendChild(detail);
  shell.appendChild(sidebar);
  document.body.appendChild(shell);
  applyPanelSize();
}

function countVisibleFeatures(patchId) {
  var state = PL()[patchId];
  if (!state) return { visible: 0, total: 0 };
  var total = state.features.length;
  var hidden = hiddenFeatureIds[patchId];
  if (!hidden) return { visible: total, total: total };
  return { visible: Math.max(0, total - hidden.size), total: total };
}

function isFeatureHidden(patchId, featIdx) {
  return hiddenFeatureIds[patchId] && hiddenFeatureIds[patchId].has(featIdx);
}

function schedulePatchFeatureSourceRefreshAfterPaint(state) {
  if (!state) return;
  if (state.featureVisibilityRefreshTimer) {
    window.clearTimeout(state.featureVisibilityRefreshTimer);
    state.featureVisibilityRefreshTimer = 0;
  }
  function refresh() {
    state.featureVisibilityRefreshTimer = 0;
    refreshPatchFeatureSource(state);
    renderSelectedFeatureOverlay();
  }
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(function() {
      state.featureVisibilityRefreshTimer = window.setTimeout(refresh, 0);
    });
  } else {
    state.featureVisibilityRefreshTimer = window.setTimeout(refresh, 0);
  }
}

function refreshFeatureVisibility(state, patchId) {
  var selectedInPatch = selectedFeatureRawFeature && String(selectedFeaturePatchId) === String(patchId);
  if (selectedInPatch) {
    renderSelectedFeatureOverlay();
    schedulePatchFeatureSourceRefreshAfterPaint(state);
  } else {
    refreshPatchFeatureSource(state);
  }
}

function toggleAllFeatures(patchId, showAll) {
  var state = PL()[patchId];
  if (!state) return;
  if (!hiddenFeatureIds[patchId]) hiddenFeatureIds[patchId] = new Set();
  if (showAll) hiddenFeatureIds[patchId].clear();
  else state.features.forEach(function(feature) { hiddenFeatureIds[patchId].add(feature._featureIdx); });
  toggleAllButtonModes[String(patchId)] = showAll ? 'hide' : 'show';
  refreshFeatureVisibility(state, patchId);
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
  refreshDetailVisibilityUI(patchId);
}

function countHiddenInGroup(patchId, state, type) {
  var hidden = hiddenFeatureIds[patchId];
  var indices = (state.featureGroups || {})[type] || [];
  if (!hidden || !indices.length) return 0;
  var count = 0;
  indices.forEach(function(featIdx) {
    if (hidden.has(featIdx)) count++;
  });
  return count;
}

function renderTypeSummary(patchId, state) {
  var counts = state.typeCounts || {};
  return Object.entries(counts).map(function(entry) {
    var type = entry[0];
    var total = entry[1];
    var hidden = countHiddenInGroup(patchId, state, type);
    var allHidden = total > 0 && hidden >= total;
    var label = escapeHtml(type + ' x' + total);
    var title = label + (allHidden ? ' - click to show group' : ' - click to hide group');
    return '<span class="osm-badge' + (allHidden ? ' osm-badge-hidden' : '') + '" ' +
      'data-patch="' + escapeHtml(patchId) + '" data-group-type="' + escapeHtml(type) + '" ' +
      'title="' + title + '">' + label + '</span>';
  }).join('');
}

function detailSummaryHtml(id, state, meta) {
  return (
    '<div class="osm-summary">' +
      (meta.fn ? '<strong>' + escapeHtml(meta.fn) + '</strong>' : '<strong>patch ' + escapeHtml(id) + '</strong>') +
      '<br><span id="osm-feat-search-count" style="color:#888;font-size:11px;">' + state.features.length + ' features</span>' +
      '<br>' + renderTypeSummary(id, state) +
    '</div>'
  );
}

function refreshDetailVisibilityUI(patchId) {
  patchId = String(patchId);
  var state = PL()[patchId];
  if (!state || String(maximizedPatchId) !== patchId ||
      !featureTableState || String(featureTableState.patchId) !== patchId) {
    renderUI();
    return;
  }
  var summary = document.querySelector('#osm-detail-body .osm-summary');
  if (summary) {
    var meta = (ALL_META[activeBackend] || {})[patchId] || {};
    summary.outerHTML = detailSummaryHtml(patchId, state, meta);
  }
  updateToggleAllBtn();
  renderVirtualFeatureRows();
}

function toggleFeatureGroup(patchId, type) {
  var state = PL()[patchId];
  if (!state) return;
  var indices = state.featureGroups[type] || [];
  if (!hiddenFeatureIds[patchId]) hiddenFeatureIds[patchId] = new Set();
  var allHidden = indices.length && indices.every(function(idx) { return hiddenFeatureIds[patchId].has(idx); });
  indices.forEach(function(idx) {
    if (allHidden) hiddenFeatureIds[patchId].delete(idx);
    else hiddenFeatureIds[patchId].add(idx);
  });
  refreshFeatureVisibility(state, patchId);
  invalidateFrozenFeatureOverlay();
  scheduleFrozenFeatureOverlayBuild(260);
  refreshDetailVisibilityUI(patchId);
}

function filterDetailRows(needle) {
  if (!featureTableState) return;
  var lc = (needle || '').toLowerCase();
  setFeatureSearchValue(featureTableState.patchId, needle || '');
  featureTableState.filter = lc;
  featureTableState.indices = [];
  for (var i = 0; i < featureTableState.features.length; i++) {
    var feature = featureTableState.features[i];
    if (!feature) continue;
    var row = feature._row;
    var fid = row ? row.idLower : getFeatureId(feature).toLowerCase();
    var type = row && row.type ? row.type.toLowerCase() : '';
    var value = row && row.value ? row.value.toLowerCase() : '';
    if (!lc || fid.includes(lc) || type.includes(lc) || value.includes(lc)) featureTableState.indices.push(i);
  }
  var scroller = document.getElementById('osm-virtual-table-scroll');
  if (scroller) scroller.scrollTop = 0;
  featureTableState.loaded = Math.min(FEATURE_PANEL_BATCH, featureTableState.indices.length);
  renderVirtualFeatureRows();
}

function featureSearchKey(patchId) {
  return activeBackend + '|' + String(patchId);
}

function getFeatureSearchValue(patchId) {
  return featureSearchByPatch[featureSearchKey(patchId)] || '';
}

function setFeatureSearchValue(patchId, value) {
  if (patchId == null) return;
  var key = featureSearchKey(patchId);
  var normalized = (value || '').trim();
  if (normalized) featureSearchByPatch[key] = normalized;
  else delete featureSearchByPatch[key];
}

function saveCurrentFeatureSearch() {
  if (!maximizedPatchId) return;
  var searchInput = document.getElementById('osm-feat-search-input');
  if (searchInput) {
    setFeatureSearchValue(maximizedPatchId, searchInput.value);
  } else if (featureTableState && featureTableState.patchId === maximizedPatchId) {
    setFeatureSearchValue(maximizedPatchId, featureTableState.filter || '');
  }
}

function clearDetailFeatureSearch() {
  var searchInput = document.getElementById('osm-feat-search-input');
  if (searchInput) searchInput.value = '';
  if (maximizedPatchId) setFeatureSearchValue(maximizedPatchId, '');
  filterDetailRows('');
}

function maybeLoadMoreFeatureRows(viewport) {
  if (!featureTableState || !viewport) return;
  var loaded = featureTableState.loaded || 0;
  if (loaded >= featureTableState.indices.length) return;
  var loadedHeight = loaded * FEATURE_ROW_HEIGHT;
  var remainingPx = loadedHeight - viewport.scrollTop - viewport.clientHeight;
  if (remainingPx > FEATURE_ROW_HEIGHT * 12) return;
  featureTableState.loaded = Math.min(loaded + FEATURE_PANEL_BATCH, featureTableState.indices.length);
}

function updateToggleAllBtn() {
  var btn = document.getElementById('osm-toggle-all-btn');
  if (!btn || !maximizedPatchId) return;
  var counts = countVisibleFeatures(maximizedPatchId);
  var patchId = String(maximizedPatchId);
  if (counts.total > 0 && counts.visible === 0) {
    toggleAllButtonModes[patchId] = 'show';
  } else if (counts.visible >= counts.total) {
    toggleAllButtonModes[patchId] = 'hide';
  } else if (!toggleAllButtonModes[patchId]) {
    toggleAllButtonModes[patchId] = 'hide';
  }
  if (toggleAllButtonModes[patchId] === 'show') {
    btn.textContent = 'Show all';
    btn.style.background = '#202632';
  } else {
    btn.textContent = 'Hide all';
    btn.style.background = '#1f7a39';
  }
}

function isSelectedFeatureRow(patchId, featIdx, feature) {
  if (!selectedFeatureRawFeature || String(selectedFeaturePatchId) !== String(patchId)) return false;
  if (selectedFeatureRawFeature._featureIdx != null) {
    return Number(selectedFeatureRawFeature._featureIdx) === Number(featIdx);
  }
  return !!feature && getFeatureId(selectedFeatureRawFeature) === getFeatureId(feature);
}

function renderFeatureRow(patchId, featIdx, topPx) {
  var f = featureTableState.features[featIdx];
  if (!f) return '';
  var rowData = f._row || {
    id: getFeatureId(f),
    value: getOSMValue(f.properties),
    type: getOSMType(f.properties),
    geomType: f.geometry && f.geometry.type ? f.geometry.type : ''
  };
  var t = rowData.type;
  var typeText = escapeHtml(t);
  var valueText = escapeHtml(rowData.value);
  var geomText = escapeHtml(rowData.geomType);
  var fid = rowData.id;
  var fidText = escapeHtml(fid);
  var hidden = isFeatureHidden(patchId, featIdx);
  var selected = isSelectedFeatureRow(patchId, featIdx, f);
  return '<tr class="osm-feat-row' + (hidden ? ' osm-feat-hidden' : '') + (selected ? ' osm-feat-selected' : '') + '" ' +
    'style="position:absolute;top:' + topPx + 'px;height:' + FEATURE_ROW_HEIGHT + 'px;left:0;right:0;display:grid;grid-template-columns:' + FEATURE_TABLE_COLUMNS + ';column-gap:0;align-items:center;justify-content:stretch;padding:0 8px;box-sizing:border-box;" ' +
    'data-patch="' + escapeHtml(patchId) + '" data-idx="' + featIdx + '" ' +
    'data-feature-id="' + fidText + '" title="Feature ID: ' + fidText + '">' +
    '<td class="osm-feat-id-cell" title="' + fidText + '">' + fidText + '</td>' +
    '<td title="' + valueText + '">' + valueText + '</td>' +
    '<td title="' + typeText + '"><span class="osm-tag osm-tag-' + escapeHtml(t) + '">' + typeText + '</span></td>' +
    '<td title="' + geomText + '">' + geomText + '</td>' +
  '</tr>';
}

function renderVirtualFeatureRows() {
  if (!featureTableState) return;
  var viewport = document.getElementById('osm-virtual-table-scroll');
  var body = document.getElementById('osm-virtual-feature-rows');
  var spacer = document.getElementById('osm-virtual-feature-spacer');
  if (!viewport || !body || !spacer) return;
  maybeLoadMoreFeatureRows(viewport);
  var indices = featureTableState.indices;
  var loaded = Math.min(featureTableState.loaded || FEATURE_PANEL_BATCH, indices.length);
  var viewportH = viewport.clientHeight || 360;
  var first = Math.max(0, Math.floor(viewport.scrollTop / FEATURE_ROW_HEIGHT) - FEATURE_ROW_BUFFER);
  var count = Math.ceil(viewportH / FEATURE_ROW_HEIGHT) + FEATURE_ROW_BUFFER * 2;
  var last = Math.min(loaded, first + count);
  var rows = [];
  for (var i = first; i < last; i++) rows.push(renderFeatureRow(featureTableState.patchId, indices[i], i * FEATURE_ROW_HEIGHT));
  spacer.style.height = (loaded * FEATURE_ROW_HEIGHT) + 'px';
  body.innerHTML = rows.join('');
  var countEl = document.getElementById('osm-feat-search-count');
  if (countEl) countEl.textContent = indices.length + ' features';
}

function refreshSelectedFeatureRows() {
  if (!featureTableState) return;
  renderVirtualFeatureRows();
}

function renderSidebarList() {
  ensureUIShell();
  var sidebar = document.getElementById('osm-sidebar');
  var list = document.getElementById('osm-sidebar-list');
  if (!sidebar || !list) return;
  if (sharedActiveIds.size === 0) {
    sidebar.style.display = 'none';
    return;
  }
  sidebar.style.display = 'flex';
  var ids = Array.from(sharedActiveIds).reverse();
  Array.from(list.querySelectorAll('[data-sidebar-id]')).forEach(function(row) {
    if (!sharedActiveIds.has(row.dataset.sidebarId)) list.removeChild(row);
  });
  ids.forEach(function(id, i) {
    var state = PL()[id];
    var meta = (ALL_META[activeBackend] || {})[id] || {};
    var count = state ? (state.loading ? '?' : state.features.length) : '?';
    var isActive = id === maximizedPatchId;
    var existing = list.querySelector('[data-sidebar-id="' + id + '"]');
    if (existing) {
      existing.dataset.active = isActive ? '1' : '0';
      existing.classList.toggle('active', isActive);
      var bdg = existing.querySelector('.osm-row-badge');
      if (bdg) bdg.textContent = count;
    } else {
      var row = document.createElement('div');
      row.dataset.sidebarId = id;
      row.dataset.active = isActive ? '1' : '0';
      row.className = 'osm-sidebar-row' + (isActive ? ' active' : '');
      var label = document.createElement('span');
      label.className = 'osm-row-label';
      label.textContent = 'osm_' + id;
      label.title = meta.fn || ('osm_' + id);
      var badge = document.createElement('span');
      badge.className = 'osm-row-badge';
      badge.textContent = count;
      var closeBtn = document.createElement('button');
      closeBtn.className = 'osm-row-close';
      closeBtn.title = 'Remove';
      closeBtn.textContent = 'x';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removePatch(id);
      });
      row.appendChild(label);
      row.appendChild(badge);
      row.appendChild(closeBtn);
      row.addEventListener('click', function() {
        saveCurrentFeatureSearch();
        maximizedPatchId = id;
        detailPanelMinimized = false;
        renderUI();
      });
      list.appendChild(row);
      existing = row;
    }
    if (list.children[i] !== existing) list.insertBefore(existing, list.children[i] || null);
  });
}

function renderDetailPanel() {
  ensureUIShell();
  var detail = document.getElementById('osm-detail');
  var body = document.getElementById('osm-detail-body');
  var title = document.getElementById('osm-detail-title');
  var searchBar = document.getElementById('osm-feat-search-bar');
  var search = document.getElementById('osm-feat-search-input');
  if (!detail || !body) return;
  if (detailPanelMinimized) {
    detail.style.display = 'none';
    if (searchBar) searchBar.style.display = 'none';
    featureTableState = null;
    return;
  }
  if (!maximizedPatchId || !sharedActiveIds.has(maximizedPatchId)) {
    detail.style.display = 'none';
    if (searchBar) searchBar.style.display = 'none';
    featureTableState = null;
    return;
  }
  detail.style.display = 'flex';
  if (searchBar) searchBar.style.display = 'flex';
  var id = maximizedPatchId;
  var state = PL()[id];
  var meta = (ALL_META[activeBackend] || {})[id] || {};
  var savedSearch = getFeatureSearchValue(id);
  var savedFilter = savedSearch.trim().toLowerCase();
  if (search) search.value = savedSearch;
  title.textContent = 'osm_' + id;
  updateToggleAllBtn();
  if (!state || state.loading) {
    body.innerHTML = '<div style="padding:16px;color:#888;font-size:12px;">Loading panel...</div>';
    featureTableState = null;
    return;
  }
  body.innerHTML =
    detailSummaryHtml(id, state, meta) +
    '<div class="osm-table-wrap osm-virtual-table">' +
      '<table class="osm-table"><thead><tr>' +
        '<th>ID</th><th>Value</th><th>Type</th><th>Geom</th>' +
      '</tr></thead></table>' +
      '<div id="osm-virtual-table-scroll">' +
        '<div id="osm-virtual-feature-spacer"></div>' +
        '<table class="osm-table"><tbody id="osm-virtual-feature-rows"></tbody></table>' +
      '</div>' +
    '</div>';
  featureTableState = {
    patchId: id,
    features: state.features,
    indices: [],
    filter: savedFilter,
    loaded: 0
  };
  for (var i = 0; i < state.features.length; i++) {
    var feature = state.features[i];
    if (!feature) continue;
    var row = feature._row;
    var fid = row ? row.idLower : getFeatureId(feature).toLowerCase();
    var type = row && row.type ? row.type.toLowerCase() : '';
    var value = row && row.value ? row.value.toLowerCase() : '';
    if (!featureTableState.filter ||
        fid.includes(featureTableState.filter) ||
        type.includes(featureTableState.filter) ||
        value.includes(featureTableState.filter)) {
      featureTableState.indices.push(i);
    }
  }
  featureTableState.loaded = Math.min(FEATURE_PANEL_BATCH, featureTableState.indices.length);
  var scroller = document.getElementById('osm-virtual-table-scroll');
  if (scroller) scroller.addEventListener('scroll', renderVirtualFeatureRows);
  renderVirtualFeatureRows();
}

function renderUI() {
  ensureUIShell();
  if (maximizedPatchId && !sharedActiveIds.has(maximizedPatchId)) maximizedPatchId = null;
  if (sharedActiveIds.size === 0) detailPanelMinimized = false;
  if (!maximizedPatchId && sharedActiveIds.size && !detailPanelMinimized) {
    maximizedPatchId = Array.from(sharedActiveIds).slice(-1)[0];
  }
  renderSidebarList();
  renderDetailPanel();
  applyPanelSize();
}
