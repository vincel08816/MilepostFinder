import L from 'leaflet';
import { MAP_STYLES } from './map-layers.js';

const THRUWAY_BOUNDS = L.latLngBounds(
  [40.5, -79.5],
  [45.1, -73.5],
);

const DEFAULT_CENTER = [42.9, -76.5];
const DEFAULT_ZOOM = 8;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createUserIcon() {
  return L.divIcon({
    className: 'map-pin map-pin--user',
    html: '<span class="map-pin__dot"></span><span class="map-pin__ring"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createMilepostIcon(kind) {
  const cls =
    kind === 'nearest'
      ? 'map-pin--nearest'
      : kind === 'second'
        ? 'map-pin--second'
        : 'map-pin--milepost';
  return L.divIcon({
    className: `map-pin ${cls}`,
    html: '<span class="map-pin__dot"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createSnapIcon() {
  return L.divIcon({
    className: 'map-pin map-pin--snap',
    html: '<span class="map-pin__dot"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createStreetsBasemap() {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 19,
    minZoom: 7,
    attribution: OSM_ATTRIBUTION,
  });
}

export function createMap(containerId, options = {}) {
  const map = L.map(containerId, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxBounds: THRUWAY_BOUNDS.pad(0.05),
    minZoom: 7,
    maxZoom: 18,
    zoomControl: false,
    preferCanvas: true,
  });

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);

  const baseLayers = { Streets: createStreetsBasemap() };
  baseLayers.Streets.addTo(map);

  if (options.hasTiles) {
    baseLayers['Local tiles'] = L.tileLayer('./tiles/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 7,
      bounds: THRUWAY_BOUNDS,
    });
  }

  return { map, baseLayers };
}

/** @param {L.Map} map @param {() => L.LatLngBounds | null} getHomeBounds */
export function addZoomToHomeControl(map, getHomeBounds) {
  const control = L.control({ position: 'topright' });

  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-home-control');
    const btn = L.DomUtil.create('button', 'map-home-control__btn', container);
    btn.type = 'button';
    btn.title = 'Zoom map to your location';
    btn.setAttribute('aria-label', 'Zoom map to your location');
    btn.disabled = true;
    btn.textContent = 'My location';

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(btn, 'click', () => {
      const bounds = getHomeBounds();
      if (bounds) zoomMapToHome(map, bounds);
    });

    control._btn = btn;
    return container;
  };

  control.setEnabled = (enabled) => {
    if (control._btn) control._btn.disabled = !enabled;
  };

  control.addTo(map);
  return control;
}

export const HOME_VIEW_OPTIONS = { padding: [40, 40], maxZoom: 35 };

/** @param {L.Map} map @param {L.LatLngBounds} bounds */
export function zoomMapToHome(map, bounds) {
  map.fitBounds(bounds, HOME_VIEW_OPTIONS);
}

export function addMapLegend(map) {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
      <div class="map-legend__title">Legend</div>
      <div class="map-legend__item"><span class="swatch swatch--user"></span> You</div>
      <div class="map-legend__item"><span class="swatch swatch--nearest"></span> Nearest MP</div>
      <div class="map-legend__item"><span class="swatch swatch--road"></span> Thruway</div>
    `;
    return div;
  };
  legend.addTo(map);
}

export async function detectSelfHostedTiles() {
  const probe = './tiles/8/75/95.png';
  try {
    const res = await fetch(probe, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export function showLocationResults(map, ctx) {
  const {
    userLatLng,
    accuracyM,
    nearest,
    roadResult,
    labelFn,
    fitBounds = true,
    panToUser = false,
  } = ctx;
  const resultLayers = L.layerGroup().addTo(map);
  const boundsPoints = [L.latLng(userLatLng.lat, userLatLng.lng)];

  if (accuracyM != null && accuracyM > 0) {
    L.circle(userLatLng, {
      radius: accuracyM,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1,
      dashArray: '4 4',
    }).addTo(resultLayers);
  }

  nearest.forEach(({ feature, km }, index) => {
    const [lng, lat] = feature.geometry.coordinates;
    const latLng = L.latLng(lat, lng);
    boundsPoints.push(latLng);

    L.polyline([userLatLng, latLng], {
      color: index === 0 ? '#2563eb' : '#64748b',
      weight: 2,
      opacity: 0.7,
      dashArray: index === 0 ? '6 4' : '4 6',
    }).addTo(resultLayers);

    const kind = index === 0 ? 'nearest' : 'second';
    const label = labelFn(feature);
    const marker = L.marker(latLng, {
      icon: createMilepostIcon(kind),
      zIndexOffset: 500,
    })
      .bindPopup(
        `<div class="map-popup"><strong>${index === 0 ? 'Nearest milepost' : '2nd nearest'}</strong><br>${escapeHtml(label)}<br>${(km * 0.621371).toFixed(2)} mi away</div>`,
        { maxWidth: 300 },
      )
      .addTo(resultLayers);
    if (index === 0) marker.openPopup();
  });

  if (roadResult.snapped?.geometry?.coordinates) {
    const [snapLng, snapLat] = roadResult.snapped.geometry.coordinates;
    const snapLatLng = L.latLng(snapLat, snapLng);
    boundsPoints.push(snapLatLng);

    L.polyline([userLatLng, snapLatLng], {
      color: '#ea580c',
      weight: 2,
      opacity: 0.6,
      dashArray: '2 4',
    }).addTo(resultLayers);

    L.marker(snapLatLng, { icon: createSnapIcon(), zIndexOffset: 400 })
      .bindPopup(
        `<div class="map-popup"><strong>Nearest point on road</strong><br>${(roadResult.pointDistanceKm * 0.621371).toFixed(2)} mi from you</div>`,
      )
      .addTo(resultLayers);
  }

  if (roadResult.segmentLatLngs?.length === 2) {
    const seg = L.polyline(roadResult.segmentLatLngs, MAP_STYLES.segmentActive).addTo(
      resultLayers,
    );
    seg.bindPopup(
      `<div class="map-popup"><strong>${escapeHtml(roadResult.direction ?? 'Direction')}</strong>${
        roadResult.roadName
          ? `<br><span class="muted">${escapeHtml(roadResult.roadName)}</span>`
          : ''
      }</div>`,
    );
    roadResult.segmentLatLngs.forEach(([lat, lng]) => boundsPoints.push(L.latLng(lat, lng)));
  }

  L.marker(userLatLng, { icon: createUserIcon(), zIndexOffset: 600 })
    .bindPopup(
      `<div class="map-popup"><strong>Your location</strong><br>${userLatLng.lat.toFixed(5)}, ${userLatLng.lng.toFixed(5)}${
        accuracyM != null ? `<br>±${Math.round(accuracyM)} m GPS` : ''
      }</div>`,
    )
    .addTo(resultLayers);

  const homeBounds = L.latLngBounds(boundsPoints);

  if (fitBounds) {
    zoomMapToHome(map, homeBounds);
  } else if (panToUser) {
    map.panTo(userLatLng);
  }

  return { layers: resultLayers, homeBounds };
}
