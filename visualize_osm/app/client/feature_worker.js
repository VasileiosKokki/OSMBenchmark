const pendingChunkAcks = new Map();

self.onmessage = async function(event) {
  const msg = event.data || {};
  if (msg.type === 'features-chunk-ack') {
    const ack = pendingChunkAcks.get(msg.requestId);
    if (ack) ack();
    return;
  }
  if (msg.type !== 'load-features') return;

  try {
    const response = await fetch(msg.url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();
    const features = data.features || [];

    features.sort((a, b) => {
      const pa = geometryPriority(a);
      const pb = geometryPriority(b);
      if (pa !== pb) return pa - pb;
      return featureKind(a).localeCompare(featureKind(b));
    });

    const prepared = prepareFeatureCache(features, msg.backend);

    self.postMessage({
      type: 'features-summary',
      requestId: msg.requestId,
      total: features.length,
      prepared
    });

    const chunkSize = Math.max(1, msg.chunkSize || 700);
    for (let start = 0; start < features.length; start += chunkSize) {
      self.postMessage({
        type: 'features-chunk',
        requestId: msg.requestId,
        start,
        total: features.length,
        features: features.slice(start, start + chunkSize)
      });
      await waitForChunkAck(msg.requestId);
    }

    self.postMessage({
      type: 'features-loaded',
      requestId: msg.requestId,
      total: features.length
    });
  } catch (err) {
    self.postMessage({
      type: 'features-error',
      requestId: msg.requestId,
      error: err && err.message ? err.message : String(err)
    });
  }
};

function waitForChunkAck(requestId) {
  return new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(finish, 1200);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      pendingChunkAcks.delete(requestId);
      resolve();
    }
    pendingChunkAcks.set(requestId, finish);
  });
}

function geometryPriority(feature) {
  const type = feature && feature.geometry && feature.geometry.type;
  if (type === 'LineString' || type === 'MultiLineString') return 2;
  if (type === 'Point' || type === 'MultiPoint') return 1;
  return 0;
}

function featureKind(feature) {
  const label = feature && feature.properties && feature.properties.label;
  return label || '';
}

function getOSMType(props) {
  if (!props || !props.label) return 'other';
  const first = props.label.split(';')[0];
  if (!first || !first.includes(':')) return 'other';
  return first.split(':')[0].trim();
}

function getOSMValue(props) {
  if (!props || !props.label) return 'other';
  const first = props.label.split(';')[0];
  if (!first || !first.includes(':')) return 'other';
  return first.split(':')[1].trim();
}

function featureIdKey(backend) {
  return backend === 'osmium'  ? '@id' :
         backend === 'postgis' ? 'osm_id' : 'id';
}

function getFeatureId(feature, backend) {
  const raw = String((feature.properties || {})[featureIdKey(backend)] || '');
  return raw.replace(/^[rwn]/, '');
}

function styleWeightForType(type) {
  if (type === 'waterway') return 2;
  return 1;
}

function smoothStep(value) {
  value = Math.max(0, Math.min(1, value));
  return value * value * (3 - 2 * value);
}

function extendLonLatExtent(coords, extent) {
  if (!coords || !coords.length) return extent;
  if (typeof coords[0] === 'number') {
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      extent[0] = Math.min(extent[0], lon);
      extent[1] = Math.min(extent[1], lat);
      extent[2] = Math.max(extent[2], lon);
      extent[3] = Math.max(extent[3], lat);
    }
    return extent;
  }
  coords.forEach((child) => extendLonLatExtent(child, extent));
  return extent;
}

function geometryLonLatExtent(geometry) {
  const extent = [Infinity, Infinity, -Infinity, -Infinity];
  if (!geometry) return null;
  if (geometry.type === 'GeometryCollection') {
    (geometry.geometries || []).forEach((child) => {
      const childExtent = geometryLonLatExtent(child);
      if (!childExtent) return;
      extent[0] = Math.min(extent[0], childExtent[0]);
      extent[1] = Math.min(extent[1], childExtent[1]);
      extent[2] = Math.max(extent[2], childExtent[2]);
      extent[3] = Math.max(extent[3], childExtent[3]);
    });
  } else {
    extendLonLatExtent(geometry.coordinates, extent);
  }
  return Number.isFinite(extent[0]) ? extent : null;
}

function featureDiagonalMeters(feature) {
  const extent = geometryLonLatExtent(feature && feature.geometry);
  if (!extent) return 0;
  const centerLat = (extent[1] + extent[3]) / 2;
  const lonScale = Math.max(0.1, Math.cos(centerLat * Math.PI / 180));
  const width = Math.abs(extent[2] - extent[0]) * 111320 * lonScale;
  const height = Math.abs(extent[3] - extent[1]) * 111320;
  return Math.sqrt(width * width + height * height);
}

function webMercatorScaleAtFeature(feature) {
  const extent = geometryLonLatExtent(feature && feature.geometry);
  if (!extent) return 1;
  const centerLat = (extent[1] + extent[3]) / 2;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  return 1 / Math.max(0.1, Math.abs(cosLat));
}

function featureOutlineMeters(feature, type) {
  const minMeters = 1.5;
  const maxMeters = 10;
  const minSize = 10;
  const maxSize = 650;
  const diagonal = Math.max(minSize, featureDiagonalMeters(feature));
  let t = Math.log(diagonal / minSize) / Math.log(maxSize / minSize);
  t = smoothStep(Math.max(0, Math.min(1, t)));
  const styleWeight = Math.sqrt(styleWeightForType(type));
  const groundMeters = Math.max(minMeters, Math.min(maxMeters, (minMeters + (maxMeters - minMeters) * t) * styleWeight));
  return groundMeters * webMercatorScaleAtFeature(feature);
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prepareFeatureCache(features, backend) {
  const counts = {};
  const groups = {};
  features.forEach((feature, idx) => {
    feature._featureIdx = feature._featureIdx === undefined ? idx : feature._featureIdx;
    feature.properties = feature.properties || {};
    feature.properties._featureIdx = feature._featureIdx;
    const type = getOSMType(feature.properties);
    const value = getOSMValue(feature.properties);
    const id = getFeatureId(feature, backend);
    feature._styleType = type;
    feature._featureId = id;
    feature._bounds = geometryLonLatExtent(feature.geometry);
    feature.properties._styleType = type;
    feature.properties._outlineMeters = featureOutlineMeters(feature, type);
    feature._row = {
      id,
      idLower: id.toLowerCase(),
      value,
      type,
      geomType: feature.geometry && feature.geometry.type ? feature.geometry.type : ''
    };
    counts[type] = (counts[type] || 0) + 1;
    if (!groups[type]) groups[type] = [];
    groups[type].push(feature._featureIdx);
  });
  return {
    counts,
    groups,
    summaryHtml: Object.entries(counts).map((entry) => {
      const label = escapeHtml(entry[0] + ' x' + entry[1]);
      return '<span class="osm-badge" title="' + label + '">' + label + '</span>';
    }).join('')
  };
}
