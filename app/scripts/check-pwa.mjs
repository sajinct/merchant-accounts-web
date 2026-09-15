import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Check the deployed artifacts, not just the source manifest. Works for root and Pages builds.
const output = new URL('../dist/app/browser/', import.meta.url);
const read = (name) => readFile(new URL(name, output));
const html = (await read('index.html')).toString();
const manifest = JSON.parse(await read('manifest.webmanifest'));
const worker = JSON.parse(await read('ngsw.json'));
const versionSource = await readFile(new URL('../src/app/core/build-version.ts', import.meta.url), 'utf8');
const version = versionSource.match(/BUILD_VERSION = '(\d{4}\.\d{2}\.\d{2}\.v\d+)'/)[1];
assert.equal(worker.appData?.version, version, 'Published and installed version labels must match');
const baseHref = html.match(/<base href="([^"]+)"/)?.[1];
assert(baseHref, 'Built index must contain a base href');
assert.match(html, /rel="manifest"[^>]*href="manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon"/);
assert.equal(manifest.name, 'Merchant Accounts');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.id, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './');

for (const pathname of ['/', '/merchant-accounts-web/', '/nested/merchant/']) {
  const appUrl = new URL(pathname, 'https://example.test');
  const manifestUrl = new URL('manifest.webmanifest', appUrl);
  assert.equal(new URL(manifest.id, manifestUrl).href, appUrl.href);
  assert.equal(new URL(manifest.start_url, manifestUrl).href, appUrl.href);
  for (const shortcut of manifest.shortcuts ?? []) {
    const target = new URL(shortcut.url, manifestUrl);
    assert.equal(target.pathname, appUrl.pathname, 'Shortcut must remain within the app directory');
    assert(target.hash.startsWith('#/'), 'Shortcuts must use the existing hash router');
  }
}

for (const size of [192, 512]) {
  for (const purpose of ['any', 'maskable']) {
    const icon = manifest.icons.find(
      (entry) => entry.sizes === `${size}x${size}` && entry.purpose === purpose,
    );
    assert(icon, `Missing ${size}px ${purpose} install icon`);
    assert.equal(icon.type, 'image/png');
    const buffer = await read(icon.src);
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    if (purpose === 'maskable')
      assert(
        (await sharp(buffer).stats()).isOpaque,
        'Maskable icons need a full-bleed opaque background',
      );
  }
}
const apple = await sharp(await read('icons/apple-touch-icon.png')).metadata();
assert.equal(apple.width, 180);
assert.equal(apple.height, 180);
const ico = await read('favicon.ico');
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
for (const [i, size] of [16, 32, 48].entries()) {
  const entry = 6 + 16 * i;
  assert.equal(ico[entry], size);
  assert.equal(ico[entry + 1], size);
  assert(ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8) <= ico.length);
}

assert.equal(worker.configVersion, 1);
assert.deepEqual(
  worker.dataGroups,
  [],
  'Account/API responses must stay out of the service-worker cache',
);
assert((await read('ngsw-worker.js')).length > 0);
const deploymentPaths = baseHref === './' ? ['/', '/merchant-accounts-web/'] : [baseHref];
for (const pathname of deploymentPaths) {
  const deployment = new URL(pathname, 'https://example.test');
  assert.equal(new URL(worker.index, deployment).href, new URL('index.html', deployment).href);
  for (const [url, expectedHash] of Object.entries(worker.hashTable)) {
    const resolved = new URL(url, deployment);
    assert(resolved.href.startsWith(deployment.href), `Cache asset escapes app scope: ${url}`);
    const relativePath = resolved.pathname.slice(deployment.pathname.length);
    const actualHash = createHash('sha1')
      .update(await read(relativePath))
      .digest('hex');
    assert.equal(actualHash, expectedHash, `Built asset hash mismatch: ${relativePath}`);
  }
  for (const required of [
    'index.html',
    'manifest.webmanifest',
    'favicon.svg',
    ...manifest.icons.map((icon) => icon.src),
  ]) {
    assert(
      Object.keys(worker.hashTable).some(
        (url) => new URL(url, deployment).href === new URL(required, deployment).href,
      ),
      `Missing precached asset: ${required}`,
    );
  }
}
console.log(
  `PWA checks passed: icons, installation metadata, cache hashes, and deployment paths (${baseHref}) in ${fileURLToPath(output)}`,
);
