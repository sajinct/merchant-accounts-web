// The favicon SVG is the editable source for the entire Merchant Accounts icon family.
// Run `node scripts/generate-icons.mjs` from app/ after installing dev dependencies.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = new URL('../public/', import.meta.url);
const source = await readFile(new URL('favicon.svg', publicDir), 'utf8');
const iconsDir = new URL('icons/', publicDir);
await mkdir(iconsDir, { recursive: true });

// Maskable artwork fills its canvas. Its critical mark fits in the centered
// 80% safe circle, so rounded-square, circle, and other OS masks preserve it.
const maskable = source.replace('rx="14"', 'rx="0"').replace('scale(1.14)', 'scale(1)');
const apple = source.replace('rx="14"', 'rx="0"');

for (const size of [192, 512]) {
  await sharp(Buffer.from(source))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icon-${size}.png`, iconsDir)));
  await sharp(Buffer.from(maskable))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icon-maskable-${size}.png`, iconsDir)));
}
await sharp(Buffer.from(apple))
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(new URL('apple-touch-icon.png', iconsDir)));

// ICO wraps small uncompressed DIBs for compatibility with older favicon readers.
const sizes = [16, 32, 48];
const frames = [];
for (const size of sizes) {
  const rgba = await sharp(Buffer.from(source)).resize(size, size).ensureAlpha().raw().toBuffer();
  const pixels = Buffer.alloc(size * size * 4);
  const maskStride = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskStride * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const original = (y * size + x) * 4;
      const destination = ((size - y - 1) * size + x) * 4;
      pixels[destination] = rgba[original + 2];
      pixels[destination + 1] = rgba[original + 1];
      pixels[destination + 2] = rgba[original];
      pixels[destination + 3] = rgba[original + 3];
      if (rgba[original + 3] === 0) {
        mask[(size - y - 1) * maskStride + (x >> 3)] |= 0x80 >> (x % 8);
      }
    }
  }

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length + mask.length, 20);
  frames.push(Buffer.concat([header, pixels, mask]));
}

const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([directory, ...frames]));
console.log('Generated app, maskable, Apple touch, and ICO icons from public/favicon.svg.');
