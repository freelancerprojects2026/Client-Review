import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../../../specs/01-brand-identity-design-system/tooling/node_modules/playwright/index.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const original=await readFile(resolve(here,'index.html'),'utf8');
const start='<!-- Metric integrated V2 variant: start -->';
const end='<!-- Metric integrated V2 variant: end -->';
if(original.includes(start)) throw Error('Variant already exists; preserving its pages.');
const source=await readFile(resolve(here,'../../../E7TRAF-Logo-Revision/E7TRAF-Logo-Edited-V2.svg'),'utf8');
const wordmarkSource=await readFile(resolve(here,'assets/integrated-legacy.svg'),'utf8');
const sourceHash=createHash('sha256').update(source).digest('hex');
const browser=await chromium.launch({headless:true});
let output;
try {
  const page=await browser.newPage();
  output=await page.evaluate(({original,source,wordmarkSource,sourceHash})=>{
    const parser=new DOMParser();
    const doc=parser.parseFromString(original,'text/html');
    const v2=parser.parseFromString(source,'image/svg+xml');
    const wordmarkDoc=parser.parseFromString(wordmarkSource,'image/svg+xml');
    if(v2.querySelector('parsererror')||wordmarkDoc.querySelector('parsererror')) throw Error('Invalid SVG');
    const wordmark=wordmarkDoc.documentElement;
    const player=wordmark.querySelector('[data-legacy-node]');
    if(!player||v2.querySelectorAll('path').length!==4) throw Error('Missing player geometry');
    // Preserve the exact established lettering, viewport and uniform transform.
    player.replaceChildren(...[...v2.querySelectorAll('path')].map(path=>{
      const copy=path.cloneNode(true); copy.setAttribute('fill','currentColor'); return copy;
    }));
    player.removeAttribute('data-legacy-node');
    player.setAttribute('data-v2-player','');
    player.setAttribute('data-source-sha256',sourceHash);
    player.setAttribute('data-logo-revision','V2');
    wordmark.setAttribute('aria-label','E7TRAF — E + revised V2 player + RAF');
    wordmark.setAttribute('preserveAspectRatio','xMidYMid meet');
    wordmark.querySelector('desc').textContent='Owner review · unapproved. Original Space Grotesk 700 E and RAF outlines and composition retained. Exact revised V2 player paths; established translate(14.4 4.6) scale(.5).';
    const template=doc.querySelector('#metric-revised-v2 [data-experiment-palette="metric-amber"]');
    if(!template||template.querySelectorAll('.screen').length!==6) throw Error('Missing previous V2 Metric pages');
    const flow=template.cloneNode(true);
    flow.querySelector('h3').innerHTML='<i class="swatch" aria-hidden="true"></i>Metric Amber · E + V2 player + RAF <span>#F59E0B</span><span class="experiment-badge">Owner review · unapproved</span>';
    flow.querySelectorAll('[data-experimental-frame]').forEach(frame=>{
      const screen=frame.querySelector('.screen');
      const key=`integrated-revised-v2-metric-amber-${screen.dataset.screen}`;
      frame.dataset.experimentalFrame=key;
      frame.id=`metric-integrated-v2-${screen.dataset.screen}`;
      if(frame.hasAttribute('data-extension-frame')) frame.dataset.extensionFrame=key;
      frame.querySelector('.frame-label small').textContent='Metric · E + V2 player + RAF · Owner review';
      screen.dataset.identity='integrated-revised-v2';
      screen.setAttribute('aria-label',screen.getAttribute('aria-label').replace('revised logo V2','E + revised V2 player + RAF'));
      const slot=screen.querySelector('.brand-name,.mini-wordmark');
      if(!slot||screen.querySelectorAll('.revised-symbol').length!==1) throw Error(`Unexpected identity slots: ${key}`);
      slot.replaceChildren(wordmark.cloneNode(true));
      const ids=new Map([...screen.querySelectorAll('[id]')].map(node=>[node.id,`metric-integrated-v2-${node.id}`]));
      screen.querySelectorAll('*').forEach(node=>{
        for(const attr of [...node.attributes]){
          let value=attr.value;
          if(attr.name==='id'&&ids.has(value)) value=ids.get(value);
          if(['for','aria-labelledby','aria-describedby','aria-controls'].includes(attr.name)) value=value.split(' ').map(id=>ids.get(id)||id).join(' ');
          for(const [before,after] of ids){
            value=value.replaceAll(`url(#${before})`,`url(#${after})`);
            if(value===`#${before}`) value=`#${after}`;
          }
          if(value!==attr.value) node.setAttribute(attr.name,value);
        }
      });
    });
    const frames=[['launch','Launch'],['role-choice','Role Choice'],['entry','Sign In'],['feed','Feed'],['profile','Player Profile'],['discovery','Scout Discovery']];
    const section=`<section class="owner-section" id="metric-integrated-v2" data-logo-variant="metric-integrated-v2"><h2>F · Metric · E + V2 player + RAF</h2><p class="section-note">The complete six-screen Metric experience with the revised V2 player replacing 7T in the wordmark. Established integrated lettering, alignment and proportions. Owner review · unapproved.</p><nav class="section-nav" aria-label="Metric integrated V2 pages">${frames.map(([id,label],index)=>`<a href="#metric-integrated-v2-${id}">${index+1} · ${label}</a>`).join('')}<a href="#metric-revised-v2">Previous V2 · Literal wordmark</a><a href="#integrated">Original Metric · Integrated</a></nav><p class="section-note">Use Fit width, Actual size or 2× detail above to inspect the presentation.</p><div class="zoom-region"><div class="set-board" data-experimental-set="integrated-revised-v2">${flow.outerHTML}</div></div><p class="artifact-links"><a href="assets/integrated-revised-v2.svg">E + V2 player + RAF · wordmark SVG</a></p></section>`;
    return {section,wordmark:new XMLSerializer().serializeToString(wordmark)};
  },{original,source,wordmarkSource,sourceHash});
} finally {await browser.close();}

const navLink='<a href="#metric-integrated-v2" data-metric-integrated-v2-link>F · Metric · E + V2 player + RAF</a>';
const mainLink='<a href="experiments/index.html#metric-integrated-v2" data-metric-integrated-v2-link>Metric · E + V2 player + RAF · six pages</a>';
const mainPath=resolve(here,'../index.html');
const main=await readFile(mainPath,'utf8');
if(!original.includes('<footer class="package-footer">')||!original.includes('</nav><div class="package-toolbar">')||!main.includes('</nav><div class="package-toolbar">')) throw Error('Missing insertion points');
const updated=original.replace('<footer class="package-footer">',start+output.section+end+'<footer class="package-footer">').replace('</nav><div class="package-toolbar">',navLink+'</nav><div class="package-toolbar">');
await writeFile(resolve(here,'assets/integrated-revised-v2.svg'),output.wordmark,{flag:'wx'});
await writeFile(resolve(here,'index.html'),updated);
await writeFile(mainPath,main.replace('</nav><div class="package-toolbar">',mainLink+'</nav><div class="package-toolbar">'));
console.log('Added six integrated Metric V2 pages; combined presentation count: 76.');
