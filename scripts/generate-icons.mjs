/**
 * One-off icon generator: SVG sources in public/icons/ → PNG outputs.
 * Requires: npm install -D sharp (or run after adding sharp to devDependencies).
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');

const jobs = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  { src: 'favicon.svg', out: '../favicon.ico', size: 32 },
];

await mkdir(iconsDir, { recursive: true });

for (const { src, out, size } of jobs) {
  const input = await readFile(join(iconsDir, src));
  const dest = out.startsWith('..')
    ? join(root, 'public', out.replace('../', ''))
    : join(iconsDir, out);
  await sharp(input).resize(size, size).png().toFile(dest);
  console.log(`Wrote ${dest}`);
}
