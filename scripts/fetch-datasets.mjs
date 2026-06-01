/**
 * Dev-only: download NY Thruway GeoJSON from ArcGIS FeatureServer.
 * Run: npm run fetch-data
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'data');

const BASE =
  'https://services2.arcgis.com/gubH6kG9JCAsMX2M/arcgis/rest/services';

const DATASETS = [
  {
    name: 'mileposts',
    url: `${BASE}/NY_State_Thruway_Mileposts/FeatureServer/1`,
    file: 'mileposts.geojson',
  },
  {
    name: 'thruway-roads',
    url: `${BASE}/NY_State_Thruway_Roads/FeatureServer/2`,
    file: 'thruway-roads.geojson',
  },
  {
    name: 'ramps',
    url: `${BASE}/NY_State_Thruway_Roads/FeatureServer/1`,
    file: 'ramps.geojson',
  },
  {
    name: 'interchanges',
    url: `${BASE}/NY_State_Thruway_Roads/FeatureServer/0`,
    file: 'interchanges.geojson',
  },
  {
    name: 'service-areas',
    url: `${BASE}/NY_State_Thruway_Rest_Stops/FeatureServer/0`,
    file: 'service-areas.geojson',
  },
  {
    name: 'rest-areas',
    url: `${BASE}/NY_State_Thruway_Rest_Stops/FeatureServer/2`,
    file: 'rest-areas.geojson',
  },
  {
    name: 'park-and-ride',
    url: `${BASE}/NY_State_Thruway_Park_and_Ride_Lots/FeatureServer/0`,
    file: 'park-and-ride.geojson',
  },
];

async function fetchLayerGeoJSON(layerUrl) {
  const queryUrl = new URL(`${layerUrl}/query`);
  queryUrl.searchParams.set('where', '1=1');
  queryUrl.searchParams.set('outFields', '*');
  queryUrl.searchParams.set('outSR', '4326');
  queryUrl.searchParams.set('f', 'geojson');
  queryUrl.searchParams.set('returnGeometry', 'true');

  const allFeatures = [];
  let offset = 0;
  const pageSize = 2000;

  while (true) {
    const pageUrl = new URL(queryUrl);
    pageUrl.searchParams.set('resultOffset', String(offset));
    pageUrl.searchParams.set('resultRecordCount', String(pageSize));

    const res = await fetch(pageUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${pageUrl}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }

    const features = data.features ?? [];
    allFeatures.push(...features);

    const exceeded = data.properties?.exceededTransferLimit;
    const gotFullPage = features.length >= pageSize;
    if (!exceeded && !gotFullPage) break;
    if (features.length === 0) break;

    offset += features.length;
    console.log(`  … ${allFeatures.length} features so far`);
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const ds of DATASETS) {
    console.log(`Fetching ${ds.name}…`);
    try {
      const geojson = await fetchLayerGeoJSON(ds.url);
      const outPath = join(OUT_DIR, ds.file);
      await writeFile(outPath, JSON.stringify(geojson));
      console.log(`Wrote ${geojson.features.length} features → ${outPath}`);
    } catch (err) {
      console.warn(`Skipped ${ds.name}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
