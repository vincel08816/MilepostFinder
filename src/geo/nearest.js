import { point } from '@turf/helpers';
import distance from '@turf/distance';

/**
 * @param {[number, number]} userLngLat
 * @param {import('geojson').Feature<import('geojson').Point>[]} milepostFeatures
 * @param {number} [count=2]
 */
export function nearestMileposts(userLngLat, milepostFeatures, count = 2) {
  const user = point(userLngLat);
  const ranked = milepostFeatures
    .map((feature) => ({
      feature,
      km: distance(user, feature, { units: 'kilometers' }),
    }))
    .sort((a, b) => a.km - b.km);
  return ranked.slice(0, count);
}

/**
 * Mileposts within radius of user (for map detail layer).
 * @param {[number, number]} userLngLat
 * @param {import('geojson').Feature<import('geojson').Point>[]} milepostFeatures
 * @param {number} radiusKm
 */
export function milepostsWithinRadius(userLngLat, milepostFeatures, radiusKm) {
  const user = point(userLngLat);
  return milepostFeatures.filter(
    (f) => distance(user, f, { units: 'kilometers' }) <= radiusKm,
  );
}

/** @param {import('geojson').Feature} feature */
export function milepostNumberLabel(feature) {
  const props = feature.properties ?? {};
  const posted = props.POSTED_MILEPOST ?? props.posted_milepost;
  const mile = props.MILEPOST ?? props.milepost;
  const value = posted ?? mile;
  if (value == null) return 'Milepost';
  return `MP ${value}`;
}

/** @param {import('geojson').Feature} feature */
export function milepostRoadSegment(feature) {
  const props = feature.properties ?? {};
  return props.ROAD_NAME ?? props.road_name ?? props.RTE_ABBR ?? '';
}

/** @param {import('geojson').Feature} feature */
export function milepostLabel(feature) {
  return milepostNumberLabel(feature);
}
