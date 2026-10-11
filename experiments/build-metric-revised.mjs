import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../../../specs/01-brand-identity-design-system/tooling/node_modules/playwright/index.mjs';

// Run after build.mjs to append this variant without rebuilding existing frames.
const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../../../E7TRAF-Logo-Revision/E7TRAF-Logo-Edited-V2.svg');
const source = await readFile(sourcePath, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const original = await readFile(resolve(here, 'index.html'), 'utf8');
const start = '<!-- Metric revised V2 variant: start -->';
const end = '<!-- Metric revised V2 variant: end -->';
const navLink = '<a href="#metric-revised-v2" data-metric-revised-link>E · Metric · Revised logo V2</a>';
const browser = await chromium.launch({headless:true});
let section;
try {
  const page = await browser.newPage();
  section = await page.evaluate(({original, source, sourceHash}) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(original, 'text/html');
    const svg = parser.parseFromString(source, 'image/svg+xml');
    if (svg.querySelector('parsererror') || svg.querySelectorAll('path').length !== 4) throw Error('Invalid V2 logo');
    const logo = svg.documentElement;
    // Only presentation attributes change. Paths and the source viewBox are exact.
    logo.querySelectorAll('path').forEach(path => path.setAttribute('fill', 'currentColor'));
    logo.setAttribute('width', '40');
    logo.setAttribute('height', '56');
    logo.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    logo.setAttribute('class', 'revised-symbol');
    logo.setAttribute('data-source-sha256', sourceHash);
    logo.setAttribute('data-logo-revision', 'V2');
    logo.setAttribute('aria-hidden', 'true');
    const template = doc.querySelector('#literal [data-experiment-palette="metric-amber"]');
    if (!template || template.querySelectorAll('.screen').length !== 6) throw Error('Missing six-screen Metric template');
    const flow = template.cloneNode(true);
    flow.querySelector('h3').innerHTML = '<i class="swatch" aria-hidden="true"></i>Metric Amber · Revised logo V2 <span>#F59E0B</span><span class="experiment-badge">Owner review · unapproved</span>';
    flow.querySelectorAll('[data-experimental-frame]').forEach(frame => {
      const screen = frame.querySelector('.screen');
      const key = `literal-revised-v2-metric-amber-${screen.dataset.screen}`;
      frame.dataset.experimentalFrame = key;
      frame.id = `metric-revised-v2-${screen.dataset.screen}`;
      if (frame.hasAttribute('data-extension-frame')) frame.dataset.extensionFrame = key;
      frame.querySelector('.frame-label small').textContent = 'Metric · Revised logo V2 · Owner review';
      screen.dataset.identity = 'literal-revised-v2';
      screen.dataset.logoRevision = 'V2';
      screen.setAttribute('aria-label', screen.getAttribute('aria-label').replace('literal — experimental, unapproved', 'revised logo V2 — Owner review, unapproved'));
      const oldLogo = screen.querySelector('.legacy-symbol');
      if (!oldLogo || screen.querySelectorAll('.legacy-symbol').length !== 1) throw Error(`Unexpected logo slots: ${key}`);
      oldLogo.replaceWith(logo.cloneNode(true));
      // Scope form and SVG IDs to this variant; retain all existing asset paths.
      const ids = new Map([...screen.querySelectorAll('[id]')].map(node => [node.id, `metric-revised-v2-${node.id}`]));
      screen.querySelectorAll('*').forEach(node => {
        for (const attr of [...node.attributes]) {
          let value = attr.value;
          if (attr.name === 'id' && ids.has(value)) value = ids.get(value);
          if (['for', 'aria-labelledby', 'aria-describedby', 'aria-controls'].includes(attr.name)) value = value.split(' ').map(id => ids.get(id) || id).join(' ');
          for (const [before, after] of ids) {
            value = value.replaceAll(`url(#${before})`, `url(#${after})`);
            if (value === `#${before}`) value = `#${after}`;
          }
          if (value !== attr.value) node.setAttribute(attr.name, value);
        }
      });
    });
    return `<section class="owner-section" id="metric-revised-v2" data-logo-variant="metric-revised-v2"><h2>E · Metric · Revised logo V2</h2><p class="section-note">The complete six-screen Metric experience with the revised E7TRAF symbol. Established Metric Amber typography, surfaces, layouts and controls. Owner review · unapproved.</p><nav class="section-nav" aria-label="Metric revised logo pages"><a href="#metric-revised-v2-launch">1 · Launch</a><a href="#metric-revised-v2-role-choice">2 · Role Choice</a><a href="#metric-revised-v2-entry">3 · Sign In</a><a href="#metric-revised-v2-feed">4 · Feed</a><a href="#metric-revised-v2-profile">5 · Player Profile</a><a href="#metric-revised-v2-discovery">6 · Scout Discovery</a><a href="#literal">Original Metric · Literal</a><a href="#integrated">Original Metric · Integrated</a></nav><p class="section-note">Use Fit width, Actual size or 2× detail above to inspect the presentation.</p><div class="zoom-region"><div class="set-board" data-experimental-set="literal-revised-v2">${flow.outerHTML}</div></div><p class="artifact-links"><a href="assets/E7TRAF-Logo-Edited-V2.svg">Revised logo V2 · source SVG</a></p></section>`;
  }, {original, source, sourceHash});
} finally {
  await browser.close();
}

let updated = original;
if (updated.includes(start)) {
  const from = updated.indexOf(start), to = updated.indexOf(end, from);
  if (to < 0) throw Error('Incomplete existing variant markers');
  updated = updated.slice(0, from) + start + section + end + updated.slice(to + end.length);
} else {
  if (!updated.includes('<footer class="package-footer">')) throw Error('Missing insertion point');
  updated = updated.replace('<footer class="package-footer">', start + section + end + '<footer class="package-footer">');
}
if (!updated.includes('data-metric-revised-link')) updated = updated.replace('</nav><div class="package-toolbar">', navLink + '</nav><div class="package-toolbar">');
if (!updated.includes(navLink)) throw Error('Variant navigation missing');
await copyFile(sourcePath, resolve(here, 'assets/E7TRAF-Logo-Edited-V2.svg'));
await writeFile(resolve(here, 'index.html'), updated);
const mainPath = resolve(here, '../index.html');
const main = await readFile(mainPath, 'utf8');
const mainLink = '<a href="experiments/index.html#metric-revised-v2" data-metric-revised-link>Metric · Revised logo V2 · six pages</a>';
if (!main.includes('data-metric-revised-link')) {
  const linked = main.replace('</nav><div class="package-toolbar">', mainLink + '</nav><div class="package-toolbar">');
  if (!linked.includes(mainLink)) throw Error('Main navigation insertion failed');
  await writeFile(mainPath, linked);
}
console.log('Added six Metric V2 pages. Existing Metric, SEC Gold, Neon Mint, Gold/Blue frames preserved.');
console.log(`V2 source SHA-256: ${sourceHash}`);
