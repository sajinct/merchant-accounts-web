import { readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../src/app/core/build-version.ts', import.meta.url);
let text = readFileSync(source, 'utf8');
let version = text.match(/BUILD_VERSION = '(\d{4}\.\d{2}\.\d{2}\.v\d+)'/)[1];
if (process.argv.includes('--next')) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '.');
  const revision = version.startsWith(`${date}.v`) ? Number(version.split('.v')[1]) + 1 : 1;
  const next = `${date}.v${revision}`;
  text = text.replace(version, next);
  version = next;
  writeFileSync(source, text);
}
const configPath = new URL('../ngsw-config.json', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.appData = { ...config.appData, version };
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(`App build: ${version}`);
