import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import './style.css';
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
  zoomToUserLocation,
} from './map.js';
import { applyMobileDocumentFlag } from './browser.js';
import {
  formatLocationCoords,
  hideMapSnackbar,
  renderResults,
  setLocation,
  showMapError,
} from './ui.js';

applyMobileDocumentFlag();

const resultsEl = document.getElementById('results');

document.querySelector('[data-map-snackbar-dismiss]')?.addEventListener('click', () => {
  hideMapSnackbar();
});

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
    showMapError(err.message || 'Thruway data could not be loaded.', 0);
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
  let hasZoomedToUser = false;
  let hasLocationResults = false;
  let hasPreciseGps = false;
  /** @type {[number, number] | null} */
  let lastAppliedLngLat = null;
  let stopAcquisitionPolling = () => {};
  const acquisitionStartedAt = Date.now();
  let useRelaxedAccuracy = false;

  function maybeRelaxAccuracyThreshold() {
    if (
      hasLocationResults ||
      useRelaxedAccuracy ||
      Date.now() - acquisitionStartedAt < ACCURACY_FALLBACK_MS
    ) {
      return;
    }
    useRelaxedAccuracy = true;
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
    setLocation(coords);
    maybeRelaxAccuracyThreshold();

    const userLatLng = { lat: coords.latitude, lng: coords.longitude };
    const gpsPrecise = isAcceptableAccuracy(coords, useRelaxedAccuracy);
    const isFirstResult = !hasLocationResults;

    if (!isFirstResult && !movedEnoughMeters(coords, lastAppliedLngLat)) {
      if (gpsPrecise) hideMapSnackbar();
      return;
    }

    lastAppliedLngLat = [coords.longitude, coords.latitude];
    hasLocationResults = true;

    const userLngLat = fromLeafletLatLng(userLatLng);

    const nearest = nearestMileposts(userLngLat, mileposts.features, 2);
    const roadResult = nearestRoadDirection(userLngLat, roads);
    const { offThruway } = isOffThruway(userLngLat, { roads, ramps, interchanges });

    clearLocationLayers();

    nearbyLayer = addNearbyMilepostsLayer(
      map,
      milepostsWithinRadius(userLngLat, mileposts.features, 15),
    );

    const shouldFitMap = isFirstResult || !hasZoomedToUser;
    if (shouldFitMap && !gpsPrecise) {
      zoomToUserLocation(map, userLatLng, coords.accuracy);
      hasZoomedToUser = true;
    }

    resultLayers = showLocationResults(map, {
      userLatLng,
      accuracyM: coords.accuracy,
      nearest,
      roadResult,
      labelFn: milepostLabel,
      fitBounds: shouldFitMap && gpsPrecise,
      panToUser: !shouldFitMap,
    });
    if (shouldFitMap && gpsPrecise) {
      hasZoomedToUser = true;
    }
    homeBounds = resultLayers.homeBounds;
    homeControl.setEnabled(true);

    renderResults(resultsEl, {
      locationCoords: formatLocationCoords(coords),
      nearest,
      direction: roadResult.direction,
      offThruway,
      impreciseGps: !gpsPrecise,
      roadName: roadResult.roadName,
      milepostLabel,
      milepostRoadSegment,
    });

    if (gpsPrecise) hideMapSnackbar();

    if (gpsPrecise && !hasPreciseGps) {
      hasPreciseGps = true;
      stopAcquisitionPolling();
    }
  }

  stopAcquisitionPolling = startAcquisitionPolling((coords) =>
    applyLocation(coords),
  );

  const stopWatching = watchPosition(
    (coords) => applyLocation(coords),
    (err) => {
      if (!hasLocationResults) {
        showMapError(err.message || 'Your location is unavailable.');
      } else {
        showMapError(err.message || 'GPS error.');
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
  showMapError(err.message || 'The app failed to start.', 0);
});
