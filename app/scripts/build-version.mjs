import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../src/app/core/build-version.ts', import.meta.url);
let text = readFileSync(source, 'utf8');
let version = text.match(/BUILD_VERSION = '(\d{4}\.\d{2}\.\d{2}\.v\d+)'/)[1];
const githubBuild = process.argv.includes('--github');
if (githubBuild || process.argv.includes('--next')) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '.');
  const runNumber = process.env.GITHUB_RUN_NUMBER;
  if (githubBuild && !/^[1-9]\d*$/.test(runNumber ?? '')) {
    throw new Error('--github requires a positive GITHUB_RUN_NUMBER');
  }
  // The workflow sequence avoids needing write access or a shared daily counter.
  const revision = githubBuild
    ? runNumber
    : version.startsWith(`${date}.v`)
      ? Number(version.split('.v')[1]) + 1
      : 1;
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
if (githubBuild && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `App build version: **${version}**\n`);
}
