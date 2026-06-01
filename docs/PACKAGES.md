# Packages and dependencies

Client-only stack for [design.md](../design.md): Vite bundles a static site; Leaflet renders the map; modular Turf packages perform geospatial math. No backend and no runtime calls to ArcGIS or other third-party APIs.

## Install commands

From the project root:

```bash
npm install
```

Runtime dependencies (also declared in `package.json`):

```bash
npm install leaflet @turf/helpers @turf/distance @turf/nearest-point-on-line @turf/bearing
```

Development:

```bash
npm install -D vite
```

Download NY Thruway GeoJSON (dev machine only, writes to `public/data/`):

```bash
npm run fetch-data
```

## Runtime dependencies

| Package | Version (approx.) | design.md step | Purpose | Import example |
|---------|-------------------|----------------|-----------------|----------------|
| [leaflet](https://www.npmjs.com/package/leaflet) | ^1.9.4 | 3–4 | Map, markers, GeoJSON road layer, `fitBounds` | `import L from 'leaflet'` |
| [@turf/helpers](https://www.npmjs.com/package/@turf/helpers) | ^7.2 | 2, 5 | `point()` for Turf geometry | `import { point } from '@turf/helpers'` |
| [@turf/distance](https://www.npmjs.com/package/@turf/distance) | ^7.2 | 2, 4 | Haversine distance user → milepost | `import distance from '@turf/distance'` |
| [@turf/nearest-point-on-line](https://www.npmjs.com/package/@turf/nearest-point-on-line) | ^7.2 | 5 | Snap user to nearest road segment | `import { nearestPointOnLine } from '@turf/nearest-point-on-line'` |
| [@turf/bearing](https://www.npmjs.com/package/@turf/bearing) | ^7.2 | 5 | Segment heading → Northbound / … / Westbound | `import bearing from '@turf/bearing'` |

Implementation lives in:

- `src/geo/nearest.js` — two nearest mileposts
- `src/geo/direction.js` — road direction
- `src/map.js` — Leaflet setup

### Turf transitive dependencies

`@turf/distance`, `@turf/bearing`, and `@turf/nearest-point-on-line` pull in small helpers (`@turf/invariant`, etc.). You do not install these directly unless debugging bundle size. Vite tree-shakes unused exports.

### Not installed (intentionally)

| Package | Why we skip it |
|---------|----------------|
| `@turf/turf` | Full meta-package; larger bundle than the four modules we need |
| `axios`, `node-fetch` (in app) | No HTTP from the browser at runtime |
| `leaflet-geosearch`, Mapbox/MapLibre plugins | External geocoding or tile APIs break the privacy goal |
| Geolocation wrappers | `navigator.geolocation` is enough |
| Express, Fastify, etc. | No backend |

## Dev-only dependencies

| Package | Purpose |
|---------|---------|
| [vite](https://www.npmjs.com/package/vite) | Dev server, production bundle, serves `public/` |

| Script | Purpose |
|--------|---------|
| `scripts/fetch-datasets.mjs` | Node 18+ `fetch`; downloads mileposts and roads GeoJSON once; **not** shipped to users as executable logic beyond the npm script |

## Native APIs and non-npm assets

| API / asset | design.md step | Notes |
|-------------|----------------|-------|
| `navigator.geolocation` | 1 | Requires HTTPS or `localhost`; user must grant permission |
| `public/data/*.geojson` | 2–5 | Bundled static files; loaded with same-origin `fetch('./data/...')` |
| `public/tiles/{z}/{x}/{y}.png` | 3–4 | Self-hosted basemap (see below) |

## Privacy and network

At **runtime** the app should only:

1. Call the browser Geolocation API (coordinates stay on device).
2. Request same-origin static files: GeoJSON, JS/CSS bundle, optional tiles under `/tiles/`.

It must **not**:

- Query ArcGIS or NY GIS services from the browser.
- Load map tiles from OpenStreetMap, Mapbox, or other CDNs.
- Send coordinates to analytics or logging endpoints.

Geolocation and all distance/bearing math run in the browser. See [GEOSPATIAL-MATH.md](./GEOSPATIAL-MATH.md) for algorithms.

## Self-hosted map tiles

Tiles are **not** an npm package. They are raster PNGs served from the same origin as the app.

### Directory layout

```
public/tiles/
  {z}/
    {x}/
      {y}.png
```

Example: `public/tiles/10/301/384.png`

The app probes for tiles (see `detectSelfHostedTiles` in `src/map.js`). If none exist, it still shows roads and mileposts on a plain background.

### Generating tiles (NY Thruway corridor)

Choose one workflow; all produce files you copy into `public/tiles/`.

**Option A — MBTiles then extract**

1. Download OSM data for New York (e.g. [Geofabrik](https://download.geofabrik.de/north-america/us/new-york.html)) or clip to Thruway bounds (~40.5°N–45.1°N, 79.5°W–73.5°W).
2. Build MBTiles with [tilemaker](https://github.com/systemed/tilemaker) or [Planetiler](https://github.com/onthegomap/planetiler).
3. Export to XYZ PNG with [mb-util](https://github.com/mapbox/mbutil) or `gdal_translate`:

   ```bash
   mb-util --image_format=png thruway.mbtiles public/tiles
   ```

**Option B — Direct XYZ from Planetiler**

Planetiler can emit a directory tree of PNG tiles; point output at `public/tiles/`.

**Option C — Pre-rendered subset**

For a minimal demo, render zoom levels 7–12 only for the corridor bounding box above to keep repo size manageable.

### Leaflet configuration

```javascript
L.tileLayer('./tiles/{z}/{x}/{y}.png', {
  maxZoom: 16,
  minZoom: 7,
  bounds: thruwayBounds,
}).addTo(map);
```

Set `maxBounds` on the map (see `src/map.js`) so users do not pan into areas with no tiles.

### Committing tiles

Tiles can be large. Options:

- Commit a low-zoom subset for development.
- Add `public/tiles/**` to `.gitignore` and document generation in CI or locally.
- Use Git LFS for full pyramids.

## Bundle notes

After `npm run build`, inspect `dist/assets/` for chunk sizes. Modular `@turf/*` imports keep the math bundle smaller than `@turf/turf`. Leaflet CSS is imported from `src/main.js` so no CDN is required.

## Future datasets (travel plazas)

Same pattern as mileposts:

1. Export GeoJSON at build time (`npm run fetch-data` or a sibling script).
2. Place under `public/data/travel-plazas.geojson`.
3. Reuse `@turf/distance` and `nearestMileposts()` with a different feature list.

No new runtime packages required unless you add a spatial index (`@turf/kdbush`, `@turf/neighbors`) for much larger point sets.

## Data sources (build-time only)

| Dataset | ArcGIS layer |
|---------|----------------|
| Mileposts (every 0.1 mi) | [FeatureServer/1](https://services2.arcgis.com/gubH6kG9JCAsMX2M/arcgis/rest/services/NY_State_Thruway_Mileposts/FeatureServer/1) |
| Thruway roads | [FeatureServer/2](https://services2.arcgis.com/gubH6kG9JCAsMX2M/arcgis/rest/services/NY_State_Thruway_Roads/FeatureServer/2) |

NY GIS portal pages: [mileposts](https://data.gis.ny.gov/maps/552eae9c046e47c8a933249581cc3ba2), [roads](https://data.gis.ny.gov/maps/aa96f425af4e4b999a4b02ab7ee69286/about).
