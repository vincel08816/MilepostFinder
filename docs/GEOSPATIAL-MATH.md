# Geospatial math (JavaScript)

All distance and direction calculations run in the browser using [Turf](https://turfjs.org/) modules. Source: `src/geo/`.

## Coordinate conventions

| System | Order | Example (Albany area) |
|--------|--------|-------------------------|
| **Turf** | `[longitude, latitude]` | `[-73.75, 42.65]` |
| **Leaflet** | `{ lat, lng }` | `{ lat: 42.65, lng: -73.75 }` |
| **GeoJSON** | `[longitude, latitude]` | Same as Turf |

Swapping lat/lng is a common bug: Turf `distance` and `nearestPointOnLine` will return wrong results if you pass `[lat, lng]`.

Helpers in `src/geo/coordinates.js`:

```javascript
export function toTurfLngLat(lng, lat) {
  return [lng, lat];
}

export function fromLeafletLatLng(latLng) {
  return [latLng.lng, latLng.lat];
}
```

## Distance (user → milepost)

Uses the haversine formula via `@turf/distance` (great-circle distance on the WGS84 sphere).

```javascript
import { point } from '@turf/helpers';
import distance from '@turf/distance';

const user = point([-76.5, 43.0]); // lng, lat
const milepostFeature = /* GeoJSON Point feature */;

const km = distance(user, milepostFeature, { units: 'kilometers' });
const miles = km * 0.621371;
```

Supported `units`: `'kilometers'` (default), `'miles'`, `'meters'`, etc.

## Two nearest mileposts

**Algorithm:** For each milepost point feature, compute distance to the user, sort ascending, take the first two.

**Complexity:** O(n log n) for n ≈ 3,000 tenth-mile posts — fine in the browser. For much larger sets, consider `@turf/kdbush` + `@turf/neighbors`.

Full implementation (`src/geo/nearest.js`):

```javascript
import { point } from '@turf/helpers';
import distance from '@turf/distance';

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
```

**Labels:** Prefer `POSTED_MILEPOST` (signage) over `MILEPOST` (calculated). See `milepostLabel()` in the same file.

## Nearest point on road line

`@turf/nearest-point-on-line` projects the user onto the closest point on a `LineString` and returns metadata about that location.

```javascript
import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import { point } from '@turf/helpers';

const user = point(userLngLat);
const snapped = nearestPointOnLine(roadLineFeature, user, {
  units: 'kilometers',
});
```

Useful properties on `snapped.properties` (Turf 7.x):

| Property | Meaning |
|----------|---------|
| `segmentIndex` | Index of the line segment containing the closest point |
| `pointDistance` | Distance from user to the line (km if `units: 'kilometers'`) |
| `totalDistance` | Distance along the line from its start to the snapped point |

Older Turf versions used `index` and `dist` instead — the app checks both.

## Bearing and cardinal direction

1. Read segment endpoints at `coordinates[segmentIndex]` and `coordinates[segmentIndex + 1]`. If the snap is on the final vertex, use the previous segment (`i - 1` → `i`) instead.
2. `bearing(start, end)` → degrees from north, clockwise, range −180…180.
3. Map to **Northbound / Eastbound / Southbound / Westbound** using 45° sectors.

```javascript
import bearing from '@turf/bearing';
import { point } from '@turf/helpers';

let i = snapped.properties.segmentIndex ?? 0;
let j = i + 1;
if (j >= coords.length) {
  j = i;
  i = Math.max(0, i - 1);
}
const deg = bearing(point(coords[i]), point(coords[j]));

function bearingToCardinal(deg) {
  const az = (deg + 360) % 360;
  if (az >= 315 || az < 45) return 'Northbound';
  if (az >= 45 && az < 135) return 'Eastbound';
  if (az >= 135 && az < 225) return 'Southbound';
  return 'Westbound';
}
```

### Cardinal sectors

| Azimuth (°) | Label |
|-------------|--------|
| [315, 360) ∪ [0, 45) | Northbound |
| [45, 135) | Eastbound |
| [135, 225) | Southbound |
| [225, 315) | Westbound |

### Multiple road features

Loop every `LineString` in `thruway-roads.geojson`, run `directionOnRoad` for each, and keep the result with the smallest `pointDistance`. See `nearestRoadDirection()` in `src/geo/direction.js`.

### Optional refinement (v2)

On divided highways, geometry alone may not match “official” NB/SB. Compare `POSTED_MILEPOST` of the two nearest mileposts on the same `RTE_ABBR`: if milepost numbers increase in the direction of `bearing`, label accordingly.

## Map zoom

After computing positions, fit the map to the user and both mileposts:

```javascript
map.fitBounds(L.latLngBounds(points), {
  padding: [48, 48],
  maxZoom: 15,
});
```

## Edge cases

| Case | Behavior |
|------|----------|
| Geolocation denied / timeout | Show error; no math run |
| Missing `public/data/*.geojson` | Prompt to run `npm run fetch-data` |
| User far from Thruway (`pointDistance` > 2 km) | Still show best-effort direction; UI warning in `src/ui.js` |
| Antipodal line segments | Rare; Turf may treat point as on line |
| No self-hosted tiles | Map works with vector layers only |

## Worked example (sanity check)

After `npm run fetch-data`, pick a known milepost from the GeoJSON and use its coordinates as the “user” in dev tools:

1. Open `public/data/mileposts.geojson`, find a feature with `"POSTED_MILEPOST": 300` (example).
2. Use its `[lng, lat]` as `userLngLat`.
3. `nearestMileposts` should return that feature first (distance ≈ 0).
4. Direction should match the local road segment bearing.

For live testing, allow location on `https://localhost:5003` (Vite dev server) or deploy behind HTTPS.

## Related docs

- [PACKAGES.md](./PACKAGES.md) — npm packages, tiles, privacy
- [design.md](../design.md) — product requirements
