/**
 * Turf uses [longitude, latitude]; Leaflet uses [latitude, longitude].
 */

/** @param {number} lng @param {number} lat @returns {[number, number]} */
export function toTurfLngLat(lng, lat) {
  return [lng, lat];
}

/** @param {[number, number]} lngLat @returns {{ lat: number, lng: number }} */
export function toLeafletLatLng(lngLat) {
  return { lat: lngLat[1], lng: lngLat[0] };
}

/** @param {{ lat: number, lng: number }} latLng @returns {[number, number]} */
export function fromLeafletLatLng(latLng) {
  return [latLng.lng, latLng.lat];
}
