import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Both palettes live in styles.scss as the mixins `scheme-light` and `scheme-dark`.
// A second theme is only safe if every pairing still reads, so the token values are
// taken straight from the stylesheet and measured rather than eyeballed.
//
// Thresholds follow WCAG 2.2: 4.5:1 for text, 3:1 for icons, focus rings and chart
// marks, and a low bar for hairlines that only separate two surfaces.
const TEXT = 4.5;
const GRAPHIC = 3;
const LINE = 1.4;

const PAIRS = [
  ['ink', 'surface', TEXT, 'body text on a panel'],
  ['ink', 'canvas', TEXT, 'body text on the page'],
  ['ink', 'surface-hover', TEXT, 'hovered table row'],
  ['ink', 'surface-selected', TEXT, 'selected table row'],
  ['ink', 'surface-total', TEXT, 'totals row'],
  ['ink', 'surface-muted', TEXT, 'inset block'],
  ['ink-soft', 'surface', TEXT, 'breadcrumb'],
  ['muted', 'surface', TEXT, 'secondary text'],
  ['muted', 'canvas', TEXT, 'secondary text on the page'],
  ['muted', 'surface-hover', TEXT, 'secondary text in a hovered row'],
  ['ink-table-head', 'surface-sunken', TEXT, 'table heading'],
  ['faint', 'camera-bg', TEXT, 'camera placeholder'],
  ['accent', 'surface', TEXT, 'links'],
  ['accent', 'canvas', TEXT, 'links on the page'],
  ['accent', 'accent-tint', TEXT, 'hovered quick link'],
  ['accent-ink', 'avatar-bg', TEXT, 'avatar initials'],
  ['accent-strong', 'selection-bg', TEXT, 'selected text'],
  ['accent-ring', 'surface', GRAPHIC, 'focus ring'],
  ['accent-ring', 'canvas', GRAPHIC, 'focus ring on the page'],
  ['success-ink', 'success-bg', TEXT, 'success badge'],
  ['warning-ink', 'warning-bg', TEXT, 'warning badge'],
  ['neutral-ink', 'neutral-bg', TEXT, 'neutral badge'],
  ['confirm-ink', 'confirm-bg', TEXT, 'confirmation dialog'],
  ['receipt-ink', 'receipt-bg', TEXT, 'receipt reference'],
  ['payment-ink', 'payment-bg', TEXT, 'payment reference'],
  ['payment-icon-ink', 'payment-bg', GRAPHIC, 'payment icon'],
  ['empty-ink', 'empty-bg', GRAPHIC, 'empty state icon'],
  ['empty-icon', 'surface', GRAPHIC, 'empty state icon'],
  ['report-opening-ink', 'report-opening-bg', TEXT, 'opening balance row'],
  ['note-ink', 'note-bg', TEXT, 'callout'],
  ['note-icon', 'note-bg', GRAPHIC, 'callout icon'],
  ['symbol-ink', 'surface', GRAPHIC, 'panel symbol'],
  ['pill-ink', 'pill-bg', TEXT, 'update pill'],
  ['login-footer', 'surface', TEXT, 'sign-in footer'],
  ['nav-ink', 'nav-bg', TEXT, 'navigation links'],
  ['nav-ink-soft', 'nav-bg', TEXT, 'navigation text'],
  ['nav-ink-strong', 'nav-bg', TEXT, 'brand'],
  ['nav-muted', 'nav-bg', TEXT, 'navigation help'],
  ['nav-dim', 'nav-bg', TEXT, 'brand subtitle'],
  ['nav-key', 'nav-bg', TEXT, 'shortcut keys'],
  ['nav-active-ink', 'nav-active-bg', TEXT, 'active navigation item'],
  ['nav-accent', 'nav-bg', GRAPHIC, 'active item marker'],
  ['hero-eyebrow', 'nav-bg', TEXT, 'sign-in eyebrow'],
  ['hero-body', 'nav-bg', TEXT, 'sign-in body'],
  ['hero-sub', 'nav-bg', TEXT, 'sign-in subtitle'],
  ['hero-label', 'nav-bg', TEXT, 'sign-in feature'],
  ['hero-small', 'nav-bg', TEXT, 'sign-in feature detail'],
  ['hero-footer', 'nav-bg', TEXT, 'sign-in footer'],
  ['hero-footer-strong', 'nav-bg', TEXT, 'sign-in footer link'],
  ['hero-icon', 'nav-bg', GRAPHIC, 'sign-in feature icon'],
  ['flow-in', 'surface', GRAPHIC, 'money-in bars'],
  ['flow-out', 'surface', GRAPHIC, 'money-out bars'],
  ['flow-in', 'canvas', GRAPHIC, 'money-in key'],
  ['flow-out', 'canvas', GRAPHIC, 'money-out key'],
  ['chart-axis', 'surface', LINE, 'chart baseline'],
  // Material's error colour is the app's danger colour: red text on a page, and
  // the background of the error snack bar and the delete button.
  ['sys-error', 'surface', TEXT, 'error text'],
  ['sys-error', 'canvas', TEXT, 'error text on the page'],
  ['sys-error', 'danger-bg', TEXT, 'form error block'],
  ['sys-on-error', 'sys-error', TEXT, 'error snack bar and delete button'],
];

const source = await readFile(new URL('../src/styles.scss', import.meta.url), 'utf8');

// `$name: #hex;` declarations, which the token values interpolate.
const palette = new Map(
  [...source.matchAll(/^\$([\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gim)].map((m) => [m[1], m[2]]),
);

// The `--app-*` declarations inside one `@mixin <name> { … }` block.
function schemeTokens(name) {
  const start = source.indexOf(`@mixin ${name} {`);
  assert(start > -1, `@mixin ${name} is missing from styles.scss`);
  let depth = 0;
  let end = source.length;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = source.slice(start, end);
  // Token values are either a literal colour or one of the $palette variables,
  // written `#{$name}` in a declaration and `$name` inside a Sass map.
  const resolve = (value) => {
    const text = value.trim();
    const variable = /^#\{\$([\w-]+)\}$|^\$([\w-]+)$/.exec(text);
    return variable ? (palette.get(variable[1] ?? variable[2]) ?? text) : text;
  };
  const tokens = new Map(
    [...body.matchAll(/--app-([\w-]+):\s*([^;]+);/g)].map(([, token, value]) => [
      token,
      resolve(value),
    ]),
  );
  // Material's error pair comes from the mat.theme-overrides map in the same mixin.
  for (const name of ['error', 'on-error']) {
    const match = new RegExp(String.raw`^\s+${name}:\s*([^,]+),`, 'm').exec(body);
    if (match) tokens.set(`sys-${name}`, resolve(match[1]));
  }
  return tokens;
}

function channels(hex) {
  const digits = hex.replace('#', '');
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  const byte = (at) => parseInt(full.slice(at, at + 2), 16);
  return [byte(0), byte(2), byte(4), full.length === 8 ? byte(6) / 255 : 1];
}

function luminance([red, green, blue]) {
  const channel = (value) => {
    const part = value / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

// WCAG contrast, flattening a translucent foreground onto its background first.
function contrast(foreground, background) {
  const [bgRed, bgGreen, bgBlue] = channels(background);
  const [red, green, blue, alpha] = channels(foreground);
  const front = luminance([
    red * alpha + bgRed * (1 - alpha),
    green * alpha + bgGreen * (1 - alpha),
    blue * alpha + bgBlue * (1 - alpha),
  ]);
  const back = luminance([bgRed, bgGreen, bgBlue]);
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

const schemes = ['scheme-light', 'scheme-dark'].map((name) => [name, schemeTokens(name)]);
const [[, light], [, dark]] = schemes;
assert.deepEqual(
  [...light.keys()].sort(),
  [...dark.keys()].sort(),
  'Every token must exist in both schemes',
);

const failures = [];
for (const [scheme, tokens] of schemes) {
  for (const [foreground, background, minimum, use] of PAIRS) {
    const front = tokens.get(foreground);
    const back = tokens.get(background);
    assert(front, `${scheme}: --app-${foreground} is not defined`);
    assert(back, `${scheme}: --app-${background} is not defined`);
    const ratio = contrast(front, back);
    if (ratio < minimum) {
      failures.push(
        `${scheme}: ${use} — --app-${foreground} (${front}) on --app-${background} (${back})` +
          ` is ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
      );
    }
  }
}
assert.equal(failures.length, 0, `Contrast below target:\n  ${failures.join('\n  ')}`);

console.log(
  `Contrast checks passed: ${PAIRS.length} pairs across ${schemes.length} colour schemes,` +
    ` ${light.size} tokens each.`,
);
