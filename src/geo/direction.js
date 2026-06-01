import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import bearing from '@turf/bearing';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

/** Warn when farther than this from thruway roads, ramps, or interchanges. */
export const OFF_THRUWAY_MI = 0.2;
const OFF_THRUWAY_KM = OFF_THRUWAY_MI * 1.609344;

/**
 * @param {number} deg Bearing in degrees (-180..180, clockwise from north)
 */
export function bearingToCardinal(deg) {
  const az = (deg + 360) % 360;
  if (az >= 315 || az < 45) return 'Northbound';
  if (az >= 45 && az < 135) return 'Eastbound';
  if (az >= 135 && az < 225) return 'Southbound';
  return 'Westbound';
}

/**
 * @param {[number, number]} userLngLat
 * @param {import('geojson').Feature<import('geojson').LineString>} roadLineFeature
 */
export function directionOnRoad(userLngLat, roadLineFeature) {
  const user = point(userLngLat);
  const snapped = nearestPointOnLine(roadLineFeature, user, {
    units: 'kilometers',
  });
  const coords = roadLineFeature.geometry.coordinates;
  let i = snapped.properties.segmentIndex ?? snapped.properties.index ?? 0;
  let j = i + 1;
  if (j >= coords.length) {
    j = i;
    i = Math.max(0, i - 1);
  }
  const segStart = point(coords[i]);
  const segEnd = point(coords[j]);
  const deg = bearing(segStart, segEnd);
  const pointDistance =
    snapped.properties.pointDistance ?? snapped.properties.dist ?? 0;
  return {
    direction: bearingToCardinal(deg),
    pointDistanceKm: pointDistance,
    snapped,
  };
}

/**
 * @param {[number, number]} userLngLat
 * @param {import('geojson').FeatureCollection<import('geojson').LineString>} roads
 */
export function nearestRoadDirection(userLngLat, roads) {
  let best = null;

  for (const road of roads.features) {
    if (road.geometry?.type !== 'LineString') continue;
    const result = directionOnRoad(userLngLat, road);
    if (!best || result.pointDistanceKm < best.pointDistanceKm) {
      best = {
        ...result,
        roadFeature: road,
      };
    }
  }

  if (!best) {
    return {
      direction: null,
      pointDistanceKm: Infinity,
    };
  }

  const coords = best.roadFeature.geometry.coordinates;
  let i = best.snapped.properties.segmentIndex ?? best.snapped.properties.index ?? 0;
  let j = i + 1;
  if (j >= coords.length) {
    j = i;
    i = Math.max(0, i - 1);
  }

  return {
    direction: best.direction,
    pointDistanceKm: best.pointDistanceKm,
    roadName:
      best.roadFeature.properties?.NAME ??
      best.roadFeature.properties?.COMMON_NAME ??
      best.roadFeature.properties?.ROUTE ??
      '',
    snapped: best.snapped,
    segmentLatLngs: [
      [coords[i][1], coords[i][0]],
      [coords[j][1], coords[j][0]],
    ],
  };
}

/**
 * Minimum distance from user to any LineString feature (roads, ramps, etc.).
 * @param {[number, number]} userLngLat
 * @param {import('geojson').Feature<import('geojson').LineString>[] | undefined} features
 */
function minDistanceToLines(userLngLat, features) {
  if (!features?.length) return Infinity;
  const user = point(userLngLat);
  let minKm = Infinity;

  for (const feature of features) {
    if (feature.geometry?.type !== 'LineString') continue;
    const snapped = nearestPointOnLine(feature, user, { units: 'kilometers' });
    const d =
      snapped.properties.pointDistance ?? snapped.properties.dist ?? Infinity;
    if (d < minKm) minKm = d;
  }

  return minKm;
}

/**
 * Minimum distance from user to any Point feature (interchanges, etc.).
 * @param {[number, number]} userLngLat
 * @param {import('geojson').Feature<import('geojson').Point>[] | undefined} features
 */
function minDistanceToPoints(userLngLat, features) {
  if (!features?.length) return Infinity;
  const user = point(userLngLat);
  let minKm = Infinity;

  for (const feature of features) {
    if (feature.geometry?.type !== 'Point') continue;
    const d = distance(user, feature, { units: 'kilometers' });
    if (d < minKm) minKm = d;
  }

  return minKm;
}

/**
 * True when user is more than {@link OFF_THRUWAY_MI} miles from the nearest
 * thruway road, ramp, or interchange.
 * @param {[number, number]} userLngLat
 * @param {{ roads?: import('geojson').FeatureCollection, ramps?: import('geojson').FeatureCollection | null, interchanges?: import('geojson').FeatureCollection | null }} layers
 */
export function isOffThruway(userLngLat, layers) {
  const minDistanceKm = Math.min(
    minDistanceToLines(userLngLat, layers.roads?.features),
    minDistanceToLines(userLngLat, layers.ramps?.features),
    minDistanceToPoints(userLngLat, layers.interchanges?.features),
  );

  return {
    offThruway: minDistanceKm > OFF_THRUWAY_KM,
    minDistanceKm,
  };
}
