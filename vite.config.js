import http from 'node:http';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

const httpsPort = 5003;
const httpPort = 5002;

/** Redirect plain HTTP to HTTPS (e.g. http://host:5002 → https://host:5003). */
function httpToHttpsRedirect() {
  return {
    name: 'http-to-https-redirect',
    configureServer() {
      const redirectServer = http.createServer((req, res) => {
        const hostHeader = req.headers.host ?? `localhost:${httpPort}`;
        const hostname = hostHeader.split(':')[0];
        const path = req.url ?? '/';
        res.writeHead(301, {
          Location: `https://${hostname}:${httpsPort}${path}`,
        });
        res.end();
      });

      redirectServer.listen(httpPort, () => {
        console.log(
          `  ➜  HTTP redirect: http://localhost:${httpPort}/ → https://localhost:${httpsPort}/`,
        );
      });

      return () => {
        redirectServer.close();
      };
    },
  };
}

const serverOptions = {
  port: httpsPort,
  strictPort: true,
  https: true,
  host: true,
};

export default defineConfig({
  base: './',
  plugins: [
    basicSsl(),
    httpToHttpsRedirect(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/favicon.svg'],
      manifest: {
        name: 'Milepost Direction Finder',
        short_name: 'Milepost Finder',
        description:
          'Find the nearest NY Thruway mileposts and road direction from your GPS location.',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#f8f8f8',
        icons: [
          {
            src: './icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,geojson}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/tiles\/\d+\/\d+\/\d+\.png$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-tiles',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: serverOptions,
  preview: {
    ...serverOptions,
    port: 62255,
  },
});
