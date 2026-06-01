# MilepostFinder

Browser-only app that uses your GPS position to find the two nearest NY Thruway mileposts and the cardinal direction of the nearest road segment. No backend; no data leaves the browser at runtime.

## Quick start

Do **not** open `index.html` from the file explorer (`file://` will fail). Always use the dev server:

```bash
npm install
npm run fetch-data   # roads, ramps, interchanges, plazas, mileposts
npm run dev          # https://localhost:5003 (http://localhost:5002 redirects)
```

Optional: add self-hosted map tiles under `public/tiles/` — see [docs/PACKAGES.md](docs/PACKAGES.md).

## Progressive Web App (PWA)

This app is installable and caches Thruway data for offline use after the first online visit.

**Build and serve over HTTPS** (required for install prompts and geolocation in production):

```bash
npm run build
npm run preview   # https://localhost:62255
```

**Install:** In Chrome/Edge, use “Install app” in the address bar or menu. On iOS Safari, use Share → “Add to Home Screen”.

**Offline behavior:**

- After one successful load online, the app shell and all GeoJSON under `data/` (~3 MB) are precached.
- OpenStreetMap tiles you have already viewed are stored in a bounded cache (about 250 tiles, 7 days).
- GPS still works without network; the basemap only shows tiles from prior sessions unless you add self-hosted tiles under `public/tiles/`.

**Regenerate icons** (after editing SVGs in `public/icons/`):

```bash
npm run generate-icons
```

## Documentation

- [docs/PACKAGES.md](docs/PACKAGES.md) — npm dependencies, privacy, tile pipeline
- [docs/GEOSPATIAL-MATH.md](docs/GEOSPATIAL-MATH.md) — distance, bearing, and nearest-point algorithms
- [design.md](design.md) — requirements
