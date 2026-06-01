import L from 'leaflet';
import { milepostLabel } from './geo/nearest.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STYLES = {
  roadOutline: { color: '#0f172a', weight: 10, opacity: 0.3, lineCap: 'round', lineJoin: 'round' },
  roadCasing: { color: '#f8fafc', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
  roadMain: { color: '#1e40af', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' },
  roadSpur: { color: '#64748b', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
  ramp: { color: '#c2410c', weight: 3, opacity: 0.85, lineCap: 'round' },
  rampOutline: { color: '#7c2d12', weight: 5, opacity: 0.35, lineCap: 'round' },
  segmentActive: { color: '#16a34a', weight: 9, opacity: 1, lineCap: 'round' },
};

function roadStyle(feature) {
  const name = feature.properties?.NAME ?? '';
  const route = feature.properties?.ROUTE ?? '';
  const isMain =
    route === 'I-90' ||
    route === 'I-87' ||
    name.includes('Mainline') ||
    (feature.properties?.RTE_ABBR ?? '') === 'ML';
  return isMain ? STYLES.roadMain : STYLES.roadSpur;
}

function roadPopup(props = {}) {
  const name = props.NAME ?? props.COMMON_NAME ?? 'Thruway segment';
  const route = props.ROUTE ?? props.HWY_NUMBER ?? '';
  const dir = props.DIRECTION ?? '';
  const mpRange =
    props.FROM_MP != null && props.TO_MP != null
      ? `<br>Mileposts ${props.FROM_MP} – ${props.TO_MP}`
      : '';
  return `<div class="map-popup"><strong>${escapeHtml(name)}</strong>${
    route ? `<br><span class="muted">${escapeHtml(route)}</span>` : ''
  }${dir ? `<br>${escapeHtml(dir)}` : ''}${mpRange}</div>`;
}

function rampPopup(props = {}) {
  const ix = props.INTERCHANGE ?? props.interchange ?? 'Ramp';
  const route = props.ROUTE ?? '';
  return `<div class="map-popup"><strong>${escapeHtml(ix)}</strong>${
    route ? `<br><span class="muted">Ramp · ${escapeHtml(route)}</span>` : '<br><span class="muted">Exit / entrance ramp</span>'
  }</div>`;
}

function pointPopup(title, props, extra = '') {
  const name = props.NAME ?? props.name ?? title;
  const mp = props.MILEPOST != null ? `<br>Milepost ${props.MILEPOST}` : '';
  const route = props.ROUTE ? `<br><span class="muted">${escapeHtml(props.ROUTE)}</span>` : '';
  const dir = props.DIRECTION ? `<br>${escapeHtml(props.DIRECTION)}` : '';
  return `<div class="map-popup"><strong>${escapeHtml(name)}</strong>${route}${mp}${dir}${extra}</div>`;
}

function interchangeIcon() {
  return L.divIcon({
    className: 'map-facility map-facility--ix',
    html: '<span>◆</span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function facilityIcon(className, label) {
  return L.divIcon({
    className: `map-facility ${className}`,
    html: `<span>${label}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * @param {L.Map} map
 * @param {{
 *   roads: import('geojson').FeatureCollection,
 *   ramps?: import('geojson').FeatureCollection | null,
 *   interchanges?: import('geojson').FeatureCollection | null,
 *   serviceAreas?: import('geojson').FeatureCollection | null,
 *   restAreas?: import('geojson').FeatureCollection | null,
 *   parkAndRide?: import('geojson').FeatureCollection | null,
 *   extraOverlays?: Record<string, L.Layer>,
 *   showPlaceholderBackground?: boolean,
 * }} data
 * @param {Record<string, L.Layer> | null} [baseLayers]
 */
export function addInfrastructureLayers(map, data, baseLayers = null) {
  const base = L.layerGroup().addTo(map);

  if (data.showPlaceholderBackground) {
    L.rectangle(
      [
        [40.5, -79.5],
        [45.1, -73.5],
      ],
      {
        color: '#94a3b8',
        weight: 1,
        fillColor: '#e2e8f0',
        fillOpacity: 0.55,
        interactive: false,
      },
    ).addTo(base);
  }

  const layers = {
    roads: null,
    ramps: null,
    interchanges: null,
    serviceAreas: null,
    restAreas: null,
    parkAndRide: null,
  };

  if (data.roads?.features?.length) {
    L.geoJSON(data.roads, {
      style: () => STYLES.roadOutline,
      interactive: false,
    }).addTo(base);

    L.geoJSON(data.roads, {
      style: () => STYLES.roadCasing,
      interactive: false,
    }).addTo(base);

    layers.roads = L.geoJSON(data.roads, {
      style: roadStyle,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(roadPopup(feature.properties), { maxWidth: 300 });
      },
    }).addTo(base);
  }

  if (data.ramps?.features?.length) {
    L.geoJSON(data.ramps, {
      style: () => STYLES.rampOutline,
      interactive: false,
    }).addTo(base);

    layers.ramps = L.geoJSON(data.ramps, {
      style: () => STYLES.ramp,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(rampPopup(feature.properties), { maxWidth: 280 });
      },
    }).addTo(base);
  }

  if (data.interchanges?.features?.length) {
    layers.interchanges = L.geoJSON(data.interchanges, {
      pointToLayer: (feature, latlng) => {
        const props = feature.properties ?? {};
        const name =
          props.DESCRIPTION ??
          (props.INTERCHANGE ? `Exit ${props.INTERCHANGE}` : null) ??
          props.NAME ??
          'Interchange';
        return L.marker(latlng, { icon: interchangeIcon() })
          .bindPopup(
            pointPopup('Interchange', {
              ...props,
              NAME: name,
            }),
          )
          .bindTooltip(escapeHtml(name), {
            permanent: false,
            direction: 'top',
            className: 'map-label',
          });
      },
    }).addTo(base);
  }

  if (data.serviceAreas?.features?.length) {
    layers.serviceAreas = L.geoJSON(data.serviceAreas, {
      pointToLayer: (feature, latlng) =>
        L.marker(latlng, { icon: facilityIcon('map-facility--service', '⛽') })
          .bindPopup(
            pointPopup('Service area', feature.properties, '<br><span class="muted">Food, fuel, restrooms</span>'),
          )
          .bindTooltip(feature.properties?.NAME ?? 'Service area', {
            direction: 'top',
            className: 'map-label',
          }),
    }).addTo(base);
  }

  if (data.restAreas?.features?.length) {
    layers.restAreas = L.geoJSON(data.restAreas, {
      pointToLayer: (feature, latlng) =>
        L.marker(latlng, { icon: facilityIcon('map-facility--rest', 'P') })
          .bindPopup(
            pointPopup('Rest area', feature.properties, '<br><span class="muted">Parking · no services</span>'),
          )
          .bindTooltip(feature.properties?.NAME ?? 'Rest area', {
            direction: 'top',
            className: 'map-label',
          }),
    }).addTo(base);
  }

  if (data.parkAndRide?.features?.length) {
    layers.parkAndRide = L.geoJSON(data.parkAndRide, {
      pointToLayer: (feature, latlng) =>
        L.marker(latlng, { icon: facilityIcon('map-facility--parking', '🅿') })
          .bindPopup(pointPopup('Park & ride', feature.properties))
          .bindTooltip(feature.properties?.NAME ?? 'Park & ride', {
            direction: 'top',
            className: 'map-label',
          }),
    }).addTo(base);
  }

  const overlays = {};
  if (layers.roads) overlays['Thruway roads'] = layers.roads;
  if (layers.ramps) overlays['Ramps'] = layers.ramps;
  if (layers.interchanges) overlays['Interchanges'] = layers.interchanges;
  if (layers.serviceAreas) overlays['Service areas'] = layers.serviceAreas;
  if (layers.restAreas) overlays['Rest areas'] = layers.restAreas;
  if (layers.parkAndRide) overlays['Park & ride'] = layers.parkAndRide;
  if (data.extraOverlays) {
    Object.assign(overlays, data.extraOverlays);
  }

  const hasBase = baseLayers && Object.keys(baseLayers).length > 0;
  if (hasBase || Object.keys(overlays).length > 0) {
    createSymbologyLayersControl(baseLayers, overlays, {
      collapsed: true,
      position: 'topleft',
    }).addTo(map);
  }

  return { base, layers };
}

/** @type {Record<string, string>} */
const LAYER_SYMBOLOGY = {
  Streets: 'swatch--streets',
  'Local tiles': 'swatch--tiles',
  'Thruway roads': 'swatch--road',
  Ramps: 'swatch--ramp',
  Interchanges: 'swatch--ix',
  'Service areas': 'swatch--service',
  'Rest areas': 'swatch--rest',
  'Park & ride': 'swatch--parking',
};

/**
 * @param {Record<string, L.Layer> | null} baseLayers
 * @param {Record<string, L.Layer>} overlays
 * @param {L.Control.LayersOptions} options
 */
function createSymbologyLayersControl(baseLayers, overlays, options) {
  const Control = L.Control.Layers.extend({
    _addItem(obj) {
      const label = L.Control.Layers.prototype._addItem.call(this, obj);
      const symClass = LAYER_SYMBOLOGY[obj.name];
      if (!symClass) return label;

      const nameSpan = label.querySelector('span');
      if (nameSpan) {
        const swatch = L.DomUtil.create('span', `swatch layer-control-swatch ${symClass}`);
        label.insertBefore(swatch, nameSpan);
        nameSpan.textContent = obj.name;
      }
      return label;
    },
  });

  return new Control(baseLayers ?? {}, overlays, options);
}

/**
 * @param {L.Map} map
 * @param {import('geojson').Feature<import('geojson').Point>[]} features
 */
export function addNearbyMilepostsLayer(map, features) {
  const group = L.layerGroup();

  const layer = L.geoJSON(features, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 4,
        fillColor: '#cbd5e1',
        color: '#475569',
        weight: 1,
        fillOpacity: 0.9,
      }).bindTooltip(milepostLabel(feature), {
        direction: 'top',
        offset: [0, -4],
        className: 'map-label',
      }),
  });

  group.addLayer(layer);

  const updateVisibility = () => {
    const z = map.getZoom();
    if (z >= 9 && !map.hasLayer(group)) group.addTo(map);
    else if (z < 9 && map.hasLayer(group)) map.removeLayer(group);
  };

  map.on('zoomend', updateVisibility);
  updateVisibility();

  return {
    group,
    destroy() {
      map.off('zoomend', updateVisibility);
      if (map.hasLayer(group)) map.removeLayer(group);
    },
  };
}

export { STYLES as MAP_STYLES };
