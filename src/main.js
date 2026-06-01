import 'leaflet/dist/leaflet.css';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import { fromLeafletLatLng } from './geo/coordinates.js';
import { nearestMileposts, milepostLabel, milepostRoadSegment, milepostsWithinRadius } from './geo/nearest.js';
import { isOffThruway, nearestRoadDirection } from './geo/direction.js';
import {
  addInfrastructureLayers,
  addNearbyMilepostsLayer,
} from './map-layers.js';
import {
  createMap,
  detectSelfHostedTiles,
  addMapLegend,
  addZoomToHomeControl,
  showLocationResults,
} from './map.js';
import { renderResults, setStatus, showError } from './ui.js';

const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

/** Preferred GPS uncertainty (meters) for the first fix. */
const STRICT_ACCURACY_M = 10;

/** Relaxed threshold after {@link ACCURACY_FALLBACK_MS} without an acceptable fix. */
const RELAXED_ACCURACY_M = 30;

/** Wait this long for a strict fix before accepting relaxed accuracy. */
const ACCURACY_FALLBACK_MS = 10_000;

/** Poll interval while waiting for the first acceptable fix. */
const ACQUISITION_POLL_MS = 500;

/** Recompute map/results only after moving at least this far (meters). */
const MIN_MOVE_M = 8;

/** @param {boolean} relaxed */
function maxAccuracyM(relaxed) {
  return relaxed ? RELAXED_ACCURACY_M : STRICT_ACCURACY_M;
}

/** @param {GeolocationCoordinates} coords @param {boolean} relaxed */
function isAcceptableAccuracy(coords, relaxed) {
  const limit = maxAccuracyM(relaxed);
  return coords.accuracy != null && coords.accuracy <= limit;
}

function formatLocationStatus(coords, tracking, relaxed) {
  const lat = coords.latitude.toFixed(5);
  const lng = coords.longitude.toFixed(5);
  const accM =
    coords.accuracy != null ? Math.round(coords.accuracy) : null;
  const precision =
    accM != null ? ` ±${accM} m` : ' (accuracy unknown)';
  const limit = maxAccuracyM(relaxed);

  if (!isAcceptableAccuracy(coords, relaxed)) {
    const need =
      accM != null ? ` — need ≤${limit} m` : ` — need ≤${limit} m fix`;
    return tracking
      ? `Low GPS precision · ${lat}, ${lng}${precision}${need}`
      : `Waiting for GPS · ${lat}, ${lng}${precision}${need}`;
  }

  const prefix = tracking ? 'Tracking ·' : 'Location ·';
  return `${prefix} ${lat}, ${lng}${precision}`;
}

/** @param {GeolocationCoordinates} coords @param {[number, number] | null} lastLngLat */
function movedEnoughMeters(coords, lastLngLat) {
  if (!lastLngLat) return true;
  const km = distance(
    point(lastLngLat),
    point([coords.longitude, coords.latitude]),
    { units: 'kilometers' },
  );
  return km * 1000 >= MIN_MOVE_M;
}

async function loadGeoJSON(path, required = true) {
  const res = await fetch(path);
  if (!res.ok) {
    if (!required) return null;
    throw new Error(`Missing ${path}. Run: npm run fetch-data`);
  }
  return res.json();
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.message || 'Location permission denied.')),
      GEO_OPTIONS,
    );
  });
}

function watchPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError(new Error('Geolocation is not supported in this browser.'));
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => onUpdate(pos.coords),
    (err) => onError(new Error(err.message || 'Location permission denied.')),
    GEO_OPTIONS,
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

/** Aggressive polling until the first acceptable fix; then call the returned stop fn. */
function startAcquisitionPolling(onCoords) {
  let inFlight = false;
  let stopped = false;

  const poll = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    getCurrentPosition()
      .then(onCoords)
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  };

  poll();
  const intervalId = setInterval(poll, ACQUISITION_POLL_MS);

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

async function main() {
  const hasTiles = await detectSelfHostedTiles();
  const { map, baseLayers } = createMap('map', { hasTiles });

  setStatus(
    statusEl,
    hasTiles ? 'Loading Thruway data…' : 'Loading Thruway map data…',
  );

  let mileposts;
  let roads;
  let ramps;
  let interchanges;
  let serviceAreas;
  let restAreas;
  let parkAndRide;

  try {
    [
      mileposts,
      roads,
      ramps,
      interchanges,
      serviceAreas,
      restAreas,
      parkAndRide,
    ] = await Promise.all([
      loadGeoJSON('./data/mileposts.geojson'),
      loadGeoJSON('./data/thruway-roads.geojson'),
      loadGeoJSON('./data/ramps.geojson', false),
      loadGeoJSON('./data/interchanges.geojson', false),
      loadGeoJSON('./data/service-areas.geojson', false),
      loadGeoJSON('./data/rest-areas.geojson', false),
      loadGeoJSON('./data/park-and-ride.geojson', false),
    ]);
  } catch (err) {
    setStatus(statusEl, 'Data not loaded');
    showError(resultsEl, err.message);
    return;
  }

  addInfrastructureLayers(
    map,
    {
      roads,
      ramps,
      interchanges,
      serviceAreas,
      restAreas,
      parkAndRide,
      showPlaceholderBackground: false,
    },
    baseLayers,
  );
  addMapLegend(map);

  /** @type {import('leaflet').LatLngBounds | null} */
  let homeBounds = null;
  const homeControl = addZoomToHomeControl(map, () => homeBounds);

  let resultLayers = null;
  let nearbyLayer = null;
  let hasFirstFix = false;
  /** @type {[number, number] | null} */
  let lastAppliedLngLat = null;
  let stopAcquisitionPolling = () => {};
  const acquisitionStartedAt = Date.now();
  let useRelaxedAccuracy = false;

  function maybeRelaxAccuracyThreshold() {
    if (
      hasFirstFix ||
      useRelaxedAccuracy ||
      Date.now() - acquisitionStartedAt < ACCURACY_FALLBACK_MS
    ) {
      return;
    }
    useRelaxedAccuracy = true;
    setStatus(
      statusEl,
      `Still acquiring GPS — accepting fixes up to ${RELAXED_ACCURACY_M} m`,
    );
  }

  function clearLocationLayers() {
    if (resultLayers) {
      map.removeLayer(resultLayers.layers);
      resultLayers = null;
    }
    if (nearbyLayer) {
      nearbyLayer.destroy();
      nearbyLayer = null;
    }
  }

  function applyLocation(coords) {
    maybeRelaxAccuracyThreshold();

    if (!isAcceptableAccuracy(coords, useRelaxedAccuracy)) {
      setStatus(statusEl, formatLocationStatus(coords, hasFirstFix, useRelaxedAccuracy));
      return;
    }

    const isFirstFix = !hasFirstFix;

    if (!isFirstFix && !movedEnoughMeters(coords, lastAppliedLngLat)) {
      setStatus(statusEl, formatLocationStatus(coords, true, useRelaxedAccuracy));
      return;
    }

    hasFirstFix = true;
    lastAppliedLngLat = [coords.longitude, coords.latitude];

    const userLatLng = { lat: coords.latitude, lng: coords.longitude };
    const userLngLat = fromLeafletLatLng(userLatLng);

    const nearest = nearestMileposts(userLngLat, mileposts.features, 2);
    const roadResult = nearestRoadDirection(userLngLat, roads);
    const { offThruway } = isOffThruway(userLngLat, { roads, ramps, interchanges });

    clearLocationLayers();

    nearbyLayer = addNearbyMilepostsLayer(
      map,
      milepostsWithinRadius(userLngLat, mileposts.features, 15),
    );

    resultLayers = showLocationResults(map, {
      userLatLng,
      accuracyM: coords.accuracy,
      nearest,
      roadResult,
      labelFn: milepostLabel,
      fitBounds: isFirstFix,
      panToUser: !isFirstFix,
    });
    homeBounds = resultLayers.homeBounds;
    homeControl.setEnabled(true);

    renderResults(resultsEl, {
      nearest,
      direction: roadResult.direction,
      offThruway,
      roadName: roadResult.roadName,
      milepostLabel,
      milepostRoadSegment,
    });

    setStatus(statusEl, formatLocationStatus(coords, !isFirstFix, useRelaxedAccuracy));

    if (isFirstFix) {
      stopAcquisitionPolling();
    }
  }

  setStatus(statusEl, `Getting your location (≤${STRICT_ACCURACY_M} m precision)…`);

  stopAcquisitionPolling = startAcquisitionPolling((coords) =>
    applyLocation(coords),
  );

  const stopWatching = watchPosition(
    (coords) => applyLocation(coords),
    (err) => {
      if (!hasFirstFix) {
        setStatus(statusEl, 'Location unavailable');
        showError(resultsEl, err.message);
      } else {
        setStatus(statusEl, `GPS error: ${err.message}`);
      }
    },
  );

  window.addEventListener('beforeunload', () => {
    stopAcquisitionPolling();
    stopWatching();
  });
}

main().catch((err) => {
  console.error(err);
  setStatus(statusEl, 'Error');
  showError(resultsEl, err.message);
});
