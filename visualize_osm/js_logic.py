"""
js_logic.py — Generates the <script> block injected into patches_map.html.
"""
import json
from config import BACKEND_LIST, BACKEND_COLORS, DEFAULT_BACKEND

def build_script(all_meta: dict, default_group_name: str,
                 map_var: str, lazy_markers_json: str) -> str:
    all_meta_json        = json.dumps(all_meta)
    backend_list_json    = json.dumps(BACKEND_LIST)
    backend_colors_json  = json.dumps(BACKEND_COLORS)
    default_backend_json = json.dumps(DEFAULT_BACKEND)

    return rf"""
<script>
{map_var}.eachLayer(function(layer) {{
  if (layer._icon) layer.setZIndexOffset(1000);
}});

var ALL_META          = {all_meta_json};
var LAZY_MARKERS      = {lazy_markers_json};
var DEFAULT_GROUP_VAR = '{default_group_name}';
var BACKEND_ORDER     = {backend_list_json};
var BACKEND_COLORS    = {backend_colors_json};
var activeBackend     = {default_backend_json};

var sharedActiveIds  = new Set();
var maximizedPatchId = null;

var markerGroups = {{}};
markerGroups[activeBackend] = window[DEFAULT_GROUP_VAR];

function buildMarkerGroup(backend) {{
  if (markerGroups[backend]) return markerGroups[backend];
  var group = L.layerGroup();
  var markers = LAZY_MARKERS[backend] || [];
  markers.forEach(function(m) {{
    var marker = L.marker([m.lat, m.lon], {{
      icon: L.AwesomeMarkers
        ? L.AwesomeMarkers.icon({{ icon: 'circle', prefix: 'fa', markerColor: m.color }})
        : new L.Icon.Default(),
      zIndexOffset: 1000
    }});
    marker.bindTooltip('osm_' + m.patch_id + ' (' + backend + ') \u2014 click to toggle OSM features');
    marker.bindPopup(
      '<button data-patch="' + m.patch_id + '" ' +
      'style="padding:6px 12px;cursor:pointer;background:#eee;' +
      'border:1px solid #ccc;border-radius:4px;' +
      'white-space:nowrap;display:inline-block;">' +
      'Show OSM Features</button>',
      {{ maxWidth: 260 }}
    );
    marker.addTo(group);
  }});
  markerGroups[backend] = group;
  return group;
}}

// ── Patch lookup index ────────────────────────────────────────────────────────
var PATCH_LOOKUP = {{}};
Object.values(ALL_META).forEach(function(meta) {{
  Object.entries(meta).forEach(function(e) {{
    var id = e[0], m = e[1];
    if (!PATCH_LOOKUP[id]) PATCH_LOOKUP[id] = {{ id: id, meta: m }};
    if (m.fn) {{
      var stem = m.fn.replace(/\.[^/.]+$/, '');
      if (!PATCH_LOOKUP[stem])  PATCH_LOOKUP[stem]  = {{ id: id, meta: m }};
      if (!PATCH_LOOKUP[m.fn]) PATCH_LOOKUP[m.fn]  = {{ id: id, meta: m }};
    }}
  }});
}});

var layers = {{}};
BACKEND_ORDER.forEach(function(name) {{ layers[name] = {{}}; }});

function PL() {{ return layers[activeBackend]; }}

// ── Delegated click for popup buttons ────────────────────────────────────────
document.addEventListener('click', function(e) {{
  var btn = e.target.closest('button[data-patch]');
  if (!btn) return;
  toggleGeoJSON(btn.dataset.patch, btn);
}});

// ── Button sync ───────────────────────────────────────────────────────────────
function syncBtn(id) {{
  document.querySelectorAll('[data-patch="' + id + '"]').forEach(function(btn) {{
    btn.textContent      = sharedActiveIds.has(id) ? 'Hide OSM Features' : 'Show OSM Features';
    btn.style.background = sharedActiveIds.has(id) ? '#c8e6c9' : '#eee';
    btn.disabled = false;
  }});
}}

// ── OSM type helpers ──────────────────────────────────────────────────────────
function isVal(v) {{
  return v !== null && v !== undefined && v !== 'null' && v !== '';
}}

function getOSMType(props) {{
  if (!props.label) return 'other';
  var first = props.label.split(';')[0];
  if (!first || !first.includes(':')) return 'other';
  return first.split(':')[0].trim();
}}

function getOSMValue(props) {{
  if (!props.label) return 'other';
  var first = props.label.split(';')[0];
  if (!first || !first.includes(':')) return 'other';
  return first.split(':')[1].trim();
}}

function styleFeature(feature) {{
  var t = getOSMType(feature.properties);
  var styles = {{
    building:   {{color:'#555', fillColor:'#888',     weight:1, fillOpacity:0.15}},
    landuse:    {{color:'#66cc66', fillColor:'#66cc66', weight:1, fillOpacity:0.1}},
    natural:    {{color:'#228833', fillColor:'#228833', weight:1, fillOpacity:0.1}},
    water:      {{color:'#4da6ff', fillColor:'#4da6ff', weight:1, fillOpacity:0.25}},
    waterway:   {{color:'#4da6ff', fillColor:'#4da6ff', weight:2, fillOpacity:0.1}},
    amenity:    {{color:'#cc44aa', fillColor:'#cc44aa', weight:1, fillOpacity:0.1}},
    leisure:    {{color:'#00cc44', fillColor:'#00cc44', weight:1, fillOpacity:0.1}},
    shop:       {{color:'#ff9900', fillColor:'#ff9900', weight:1, fillOpacity:0.1}},
    tourism:    {{color:'#ff6688', fillColor:'#ff6688', weight:1, fillOpacity:0.1}},
    sport:      {{color:'#33aaff', fillColor:'#33aaff', weight:1, fillOpacity:0.1}},
    historic:   {{color:'#996633', fillColor:'#996633', weight:1, fillOpacity:0.1}},
    office:     {{color:'#9966cc', fillColor:'#9966cc', weight:1, fillOpacity:0.1}},
    aeroway:    {{color:'#aaaaaa', fillColor:'#aaaaaa', weight:1, fillOpacity:0.1}},
    healthcare: {{color:'#ff4444', fillColor:'#ff4444', weight:1, fillOpacity:0.1}},
    military:   {{color:'#886600', fillColor:'#886600', weight:1, fillOpacity:0.1}},
  }};
  return styles[t] || {{color:'#bbb', weight:0.5, fillOpacity:0, opacity:0.4}};
}}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function collectCoords(c, out) {{
  if (!Array.isArray(c)) return;
  if (typeof c[0] === 'number') {{ out.push(c); }}
  else {{ c.forEach(function(x) {{ collectCoords(x, out); }}); }}
}}

function flyToFeature(patchId, featIdx) {{
  var state = PL()[patchId];
  if (!state) return;
  var f = state.features[featIdx];
  if (!f || !f.geometry) return;
  var coords = [];
  collectCoords(f.geometry.coordinates, coords);
  if (!coords.length) return;
  var lats = coords.map(function(c) {{ return c[1]; }});
  var lngs = coords.map(function(c) {{ return c[0]; }});
  var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
  var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
  if (minLat === maxLat && minLng === maxLng) {{
    {map_var}.flyTo([minLat, minLng], 17, {{duration: 0.8}});
  }} else {{
    {map_var}.flyToBounds(
      [[minLat, minLng], [maxLat, maxLng]],
      {{padding: [40, 40], maxZoom: 17, duration: 0.8}}
    );
  }}
}}

// ── UI Shell ─────────────────────────────────────────────────────────────────
function ensureUIShell() {{
  if (document.getElementById('osm-ui-shell')) return;

  var shell = document.createElement('div');
  shell.id = 'osm-ui-shell';

  var sidebar = document.createElement('div');
  sidebar.id = 'osm-sidebar';

  var sidebarHeader = document.createElement('div');
  sidebarHeader.id = 'osm-sidebar-header';
  sidebarHeader.textContent = 'Active patches';

  var sidebarList = document.createElement('div');
  sidebarList.id = 'osm-sidebar-list';

  sidebar.appendChild(sidebarHeader);
  sidebar.appendChild(sidebarList);

  var detail = document.createElement('div');
  detail.id = 'osm-detail';

  var detailHeader = document.createElement('div');
  detailHeader.id = 'osm-detail-header';

  var detailTitle = document.createElement('span');
  detailTitle.id = 'osm-detail-title';

  var detailClose = document.createElement('button');
  detailClose.id = 'osm-detail-close';
  detailClose.title = 'Close detail';
  detailClose.textContent = '\u2715';
  detailClose.addEventListener('click', function() {{
    setMaximized(null);
  }});

  detailHeader.appendChild(detailTitle);
  detailHeader.appendChild(detailClose);

  var detailBody = document.createElement('div');
  detailBody.id = 'osm-detail-body';

  detail.appendChild(detailHeader);
  detail.appendChild(detailBody);

  shell.appendChild(detail);
  shell.appendChild(sidebar);
  document.body.appendChild(shell);
}}

// ── Set which patch is maximized ──────────────────────────────────────────────
function setMaximized(id) {{
  maximizedPatchId = id;
  renderDetailPanel();
  renderSidebarList();
}}

// ── Render the sidebar list ───────────────────────────────────────────────────
function renderSidebarList() {{
  ensureUIShell();
  var sidebar = document.getElementById('osm-sidebar');
  var list    = document.getElementById('osm-sidebar-list');
  if (!sidebar || !list) return;

  if (sharedActiveIds.size === 0) {{
    sidebar.style.display = 'none';
    return;
  }}
  sidebar.style.display = 'flex';

  var orderedIds = Array.from(sharedActiveIds).reverse();

  Array.from(list.querySelectorAll('[data-sidebar-id]')).forEach(function(row) {{
    if (!sharedActiveIds.has(row.dataset.sidebarId)) list.removeChild(row);
  }});

  orderedIds.forEach(function(id, i) {{
    var meta     = (ALL_META[activeBackend] || {{}})[id] || {{}};
    var state    = PL()[id];
    var count    = state ? state.features.length : '?';
    var isActive = (id === maximizedPatchId);
    var existing = list.querySelector('[data-sidebar-id="' + id + '"]');

    if (existing) {{
      var wasActive = existing.dataset.active === '1';
      if (wasActive !== isActive) {{
        existing.dataset.active = isActive ? '1' : '0';
        if (isActive) existing.classList.add('active');
        else          existing.classList.remove('active');
      }}
      var bdg = existing.querySelector('.osm-row-badge');
      if (bdg) bdg.textContent = count;
    }} else {{
      var row = document.createElement('div');
      row.dataset.sidebarId = id;
      row.dataset.active    = isActive ? '1' : '0';
      row.className = 'osm-sidebar-row' + (isActive ? ' active' : '');

      var label = document.createElement('span');
      label.className   = 'osm-row-label';
      label.textContent = 'osm_' + id;
      label.title       = meta.fn || ('osm_' + id);

      var badge = document.createElement('span');
      badge.className   = 'osm-row-badge';
      badge.textContent = count;

      var closeBtn = document.createElement('button');
      closeBtn.className   = 'osm-row-close';
      closeBtn.title       = 'Remove';
      closeBtn.textContent = '\u2715';
      closeBtn.addEventListener('click', function(e) {{
        e.stopPropagation();
        removePatch(id);
      }});

      row.appendChild(label);
      row.appendChild(badge);
      row.appendChild(closeBtn);
      row.addEventListener('click', function() {{ setMaximized(id); }});
      list.appendChild(row);
    }}

    if (list.children[i] !== (existing || list.lastElementChild)) {{
      list.insertBefore(existing || list.lastElementChild, list.children[i] || null);
    }}
  }});
}}

// ── Render the detail panel ───────────────────────────────────────────────────
function renderDetailPanel() {{
  ensureUIShell();
  var detail = document.getElementById('osm-detail');
  var title  = document.getElementById('osm-detail-title');
  var body   = document.getElementById('osm-detail-body');
  if (!detail || !body) return;

  if (!maximizedPatchId || !sharedActiveIds.has(maximizedPatchId)) {{
    detail.style.display = 'none';
    return;
  }}

  detail.style.display = 'flex';

  var id    = maximizedPatchId;
  var state = PL()[id];
  var meta  = (ALL_META[activeBackend] || {{}})[id] || {{}};

  title.textContent = 'osm_' + id;

  if (!state) {{
    body.innerHTML = '<div style="padding:16px;color:#888;font-size:12px;">Loading\u2026</div>';
    return;
  }}

  var counts = {{}};
  var rows = state.features.map(function(f, featIdx) {{
    var t = getOSMType(f.properties);
    counts[t] = (counts[t] || 0) + 1;
    var v = getOSMValue(f.properties)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return '<tr class="osm-feat-row" data-patch="' + id + '" data-idx="' + featIdx + '" title="Fly to feature">' +
      '<td>' + v + '</td>' +
      '<td><span class="osm-tag osm-tag-' + t + '">' + t + '</span></td>' +
      '<td>' + f.geometry.type + '</td>' +
    '</tr>';
  }}).join('');

  var summary = Object.entries(counts).map(function(e) {{
    return '<span class="osm-badge">' + e[0] + ' \u00d7' + e[1] + '</span>';
  }}).join('');

  body.innerHTML =
    '<div class="osm-summary">' +
      '<strong>osm_' + id + '</strong> \u2014 ' + state.features.length + ' features<br>' +
      (meta.fn ? '<span style="color:#444">' + meta.fn + '</span><br>' : '') +
      (meta.lat !== undefined
        ? '<span style="color:#888;font-size:11px">(' + meta.lat + ', ' + meta.lon + ')</span><br>'
        : '') +
      summary +
    '</div>' +
    '<div class="osm-table-wrap"><table class="osm-table">' +
      '<thead><tr><th>Value</th><th>Type</th><th>Geometry</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}}

// ── Master render ─────────────────────────────────────────────────────────────
function renderUI() {{
  if (maximizedPatchId && !sharedActiveIds.has(maximizedPatchId)) {{
    maximizedPatchId = null;
  }}
  if (!maximizedPatchId && sharedActiveIds.size > 0) {{
    maximizedPatchId = Array.from(sharedActiveIds).slice(-1)[0];
  }}
  renderSidebarList();
  renderDetailPanel();
}}

// ── Remove a patch ────────────────────────────────────────────────────────────
function removePatch(id) {{
  var state = layers[activeBackend][id];
  if (state) {{
    {map_var}.removeLayer(state.layer);
    if (state.bbox) {map_var}.removeLayer(state.bbox);
    state.hoverLayers.forEach(function(hl) {{ {map_var}.removeLayer(hl); }});
  }}
  setPatchState(id, false);
}}

// ── Patch loader ──────────────────────────────────────────────────────────────
function loadPatch(id, onDone) {{
  var backend = activeBackend;
  var meta = (ALL_META[backend] || {{}})[id];
  if (!meta) {{ if (onDone) onDone(false); return; }}

  fetch(meta.url)
    .then(function(r) {{ return r.json(); }})
    .then(function(data) {{
      var features = data.features || [];

      features.sort(function(a, b) {{
        function priority(f) {{
          var t = f.geometry.type;
          if (t === 'LineString' || t === 'MultiLineString') return 2;
          if (t === 'Point'      || t === 'MultiPoint')      return 1;
          return 0;
        }}
        var pd = priority(a) - priority(b);
        if (pd !== 0) return pd;
        function area(f) {{
          try {{
            var t = f.geometry.type;
            if (t === 'Point' || t === 'MultiPoint') return 0;
            if (t === 'LineString' || t === 'MultiLineString')
              return turf.length(f, {{units:'meters'}});
            return turf.area(f);
          }} catch(e) {{ return 0; }}
        }}
        return area(b) - area(a);
      }});

      var hoverLayers = [];
      var layer = L.geoJSON({{ type:'FeatureCollection', features:features }}, {{
        style: styleFeature,
        onEachFeature: function(feature, lyr) {{
          var type = feature.geometry.type;
          var tip  = getOSMValue(feature.properties) + ' (' + getOSMType(feature.properties) + ')';
          if (type === 'Polygon' || type === 'MultiPolygon' ||
              type === 'Point'   || type === 'MultiPoint') {{
            lyr.bindTooltip(tip, {{ sticky: true }});
            return;
          }}
          if (type === 'LineString' || type === 'MultiLineString') {{
            var hl = L.geoJSON(feature, {{
              style: {{ color:'#000', weight:14, opacity:0 }}, interactive:true
            }});
            hl.bindTooltip(tip, {{ sticky: true }});
            hoverLayers.push(hl);
          }}
        }}
      }}).addTo({map_var});

      hoverLayers.forEach(function(hl) {{ hl.addTo({map_var}); hl.bringToFront(); }});

      var bb = meta.bbox || [
        meta.lon - 0.01480, meta.lat - 0.01150,
        meta.lon + 0.01480, meta.lat + 0.01150
      ];
      var bbox = L.rectangle(
        [[bb[1], bb[0]], [bb[3], bb[2]]],
        {{color:'#ff6a00', weight:2, fill:false, dashArray:'6 4', opacity:0.85}}
      ).addTo({map_var});

      layers[backend][id] = {{
        layer: layer, hoverLayers: hoverLayers,
        features: features, bbox: bbox,
      }};

      if (onDone) onDone(true);
    }})
    .catch(function(err) {{
      console.error('Failed to load patch ' + id + ' for ' + backend, err);
      if (onDone) onDone(false);
    }});
}}

// ── Toggle patch visibility ───────────────────────────────────────────────────
window.toggleGeoJSON = function(id, btn) {{
  var meta = (ALL_META[activeBackend] || {{}})[id];
  if (!meta) {{
    btn.textContent      = 'No ' + activeBackend + ' data';
    btn.style.background = '#fdd';
    return;
  }}

  var state = layers[activeBackend][id];

  if (state) {{
    if (sharedActiveIds.has(id)) {{
      removePatch(id);
    }} else {{
      state.layer.addTo({map_var});
      if (state.bbox) state.bbox.addTo({map_var});
      state.hoverLayers.forEach(function(hl) {{ hl.addTo({map_var}); hl.bringToFront(); }});
      setPatchState(id, true);
      setMaximized(id);
    }}
    return;
  }}

  btn.textContent = 'Loading\u2026';
  btn.disabled    = true;

  loadPatch(id, function(ok) {{
    btn.disabled = false;
    if (ok) {{
      sharedActiveIds.add(id);
      btn.textContent      = 'Hide OSM Features';
      btn.style.background = '#c8e6c9';
      setMaximized(id);
    }} else {{
      btn.textContent      = 'Retry';
      btn.style.background = '#fdd';
      renderUI();
    }}
  }});
}};

// ── Backend switcher ──────────────────────────────────────────────────────────
window.selectBackend = function(newBackend) {{
  if (newBackend === activeBackend) return;

  var savedCenter = {map_var}.getCenter();
  var savedZoom   = {map_var}.getZoom();

  Object.values(layers[activeBackend]).forEach(function(s) {{
    if (s.layer) {map_var}.removeLayer(s.layer);
    if (s.bbox)  {map_var}.removeLayer(s.bbox);
    if (s.hoverLayers) s.hoverLayers.forEach(function(hl) {{ {map_var}.removeLayer(hl); }});
  }});

  var oldGroup = markerGroups[activeBackend];
  var newGroup = buildMarkerGroup(newBackend);

  var popupWasOpen    = !!{map_var}._popup && {map_var}._popup.isOpen();
  var openPopupLatLng = popupWasOpen ? {map_var}._popup.getLatLng() : null;

  if (oldGroup) {map_var}.removeLayer(oldGroup);
  newGroup.addTo({map_var});

  activeBackend = newBackend;
  if (!layers[activeBackend]) layers[activeBackend] = {{}};

  if (popupWasOpen && openPopupLatLng) {{
    newGroup.eachLayer(function(lyr) {{
      if (lyr.getLatLng &&
          lyr.getLatLng().lat === openPopupLatLng.lat &&
          lyr.getLatLng().lng === openPopupLatLng.lng) {{
        lyr.openPopup();
      }}
    }});
  }}

  var toRestore = Array.from(sharedActiveIds);
  if (!toRestore.length) {{ renderUI(); return; }}

  var pending = toRestore.length;

  function done() {{
    if (--pending === 0) {{
      sharedActiveIds.forEach(syncBtn);
      {map_var}.setView(savedCenter, savedZoom, {{animate: false}});
      renderUI();
    }}
  }}

  toRestore.forEach(function(id) {{
    var meta   = (ALL_META[newBackend] || {{}})[id];
    var cached = layers[newBackend][id];

    if (!meta) {{ done(); return; }}

    if (cached) {{
      cached.layer.addTo({map_var});
      if (cached.bbox) cached.bbox.addTo({map_var});
      cached.hoverLayers.forEach(function(hl) {{ hl.addTo({map_var}); hl.bringToFront(); }});
      syncBtn(id);
      done();
    }} else {{
      document.querySelectorAll('[data-patch="' + id + '"]').forEach(function(b) {{
        b.textContent      = 'Loading\u2026';
        b.style.background = '#ffe0b2';
        b.disabled         = true;
      }});
      loadPatch(id, function(ok) {{
        syncBtn(id);
        done();
      }});
    }}
  }});

  {map_var}.setView(savedCenter, savedZoom, {{animate: false}});
}};

// ── Shared patch state ────────────────────────────────────────────────────────
function setPatchState(id, active) {{
  if (active) sharedActiveIds.add(id);
  else        sharedActiveIds.delete(id);
  Object.values(layers).forEach(function(bl) {{
    if (bl[id]) bl[id].active = active;
  }});
  syncBtn(id);
  renderUI();
}}

// ── Patch search ──────────────────────────────────────────────────────────────
function searchPatch() {{
  var q    = document.getElementById('patch-search-input').value.trim();
  var type = document.getElementById('patch-search-type').value;
  var msg  = document.getElementById('patch-search-msg');
  msg.textContent = '';
  if (!q) return;

  if (type === 'patch') {{
    var stem = q.replace(/\.tif$/i, '');
    if (!stem.startsWith('patch_')) stem = 'patch_' + stem;
    var hit = PATCH_LOOKUP[stem] || PATCH_LOOKUP[stem + '.tif'];
    if (!hit) {{ msg.textContent = stem + ' not found.'; return; }}
    {map_var}.flyTo([hit.meta.lat, hit.meta.lon], 14, {{ duration: 1.0 }});

  }} else if (type === 'osm') {{
    var osmId = q.replace(/^osm_/i, '');
    var meta  = (ALL_META[activeBackend] || {{}})[osmId];
    if (!meta) {{ msg.textContent = 'osm_' + osmId + ' not found.'; return; }}
    {map_var}.flyTo([meta.lat, meta.lon], 14, {{ duration: 1.0 }});

  }} else if (type === 'feature') {{
    var needle  = q.toLowerCase();
    var allIds  = Object.keys(ALL_META[activeBackend] || {{}});

    var featureIdKey = activeBackend === 'osmium'  ? '@id'    :
                       activeBackend === 'osmnx'   ? 'id'     :
                       activeBackend === 'postgis' ? 'osm_id' : 'id';

    msg.textContent = 'Searching\u2026';

    if (window._featureSearchController) {{
      window._featureSearchController.abort();
    }}
    var controller = new AbortController();
    window._featureSearchController = controller;

    function searchFeatures(id, features) {{
      for (var i = 0; i < features.length; i++) {{
        var fid = String(features[i].properties[featureIdKey] || '').toLowerCase().replace(/^[rwn]/, '');
        if (fid === needle) return true;
      }}
      return false;
    }}

    function searchNext(i) {{
      if (controller.signal.aborted) return;
      if (i >= allIds.length) {{
        msg.textContent = '"' + q + '" not found.';
        return;
      }}
      var id    = allIds[i];
      var state = PL()[id];

      function onFeatures(features) {{
        if (controller.signal.aborted) return;
        if (searchFeatures(id, features)) {{
          msg.textContent = '';
          var meta = (ALL_META[activeBackend] || {{}})[id];
          {map_var}.flyTo([meta.lat, meta.lon], 14, {{ duration: 1.0 }});
        }} else {{
          searchNext(i + 1);
        }}
      }}

      if (state) {{
        onFeatures(state.features);
      }} else {{
        fetch((ALL_META[activeBackend][id]).url, {{ signal: controller.signal }})
          .then(function(r) {{ return r.json(); }})
          .then(function(data) {{ onFeatures(data.features || []); }})
          .catch(function(err) {{
            if (err.name === 'AbortError') return;
            searchNext(i + 1);
          }});
      }}
    }}

    searchNext(0);
  }}
}}

document.getElementById('patch-search-type').addEventListener('change', function() {{
  var placeholders = {{
    patch:   'e.g. patch_99868 or 99868',
    osm:     'e.g. osm_242 or 242',
    feature: 'e.g. 840860656'
  }};
  document.getElementById('patch-search-input').placeholder = placeholders[this.value];
}});

document.getElementById('patch-search-btn').addEventListener('click', searchPatch);
document.getElementById('patch-search-input').addEventListener('keydown', function(e) {{
  if (e.key === 'Enter') searchPatch();
}});

// ── Row click: fly to feature ─────────────────────────────────────────────────
document.addEventListener('click', function(e) {{
  var row = e.target.closest('tr.osm-feat-row');
  if (!row) return;
  flyToFeature(row.dataset.patch, parseInt(row.dataset.idx));
}});

// ── Sync popup button on open ─────────────────────────────────────────────────
{map_var}.on('popupopen', function(e) {{
  var btn = e.popup.getElement().querySelector('button[data-patch]');
  if (!btn) return;
  var id = btn.dataset.patch;
  btn.textContent      = sharedActiveIds.has(id) ? 'Hide OSM Features' : 'Show OSM Features';
  btn.style.background = sharedActiveIds.has(id) ? '#c8e6c9' : '#eee';
}});
</script>
"""