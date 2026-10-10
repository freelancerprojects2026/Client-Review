import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../../../specs/01-brand-identity-design-system/tooling/node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const review = resolve(here, '..');
const sourcePath = resolve(root, 'references/brand/legacy-logo/SVG.svg');
const source = await readFile(sourcePath, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const original = await readFile(resolve(review, 'index.html'), 'utf8');
const integratedSource = original.match(/<svg\b[^>]*class="integrated-wordmark"[\s\S]*?<\/svg>/)?.[0];
if (!integratedSource) throw Error('Missing original r04 integrated wordmark');
const palettes = [
  {id:'metric-amber', name:'Metric Amber', color:'#F59E0B'},
  {id:'sec-gold', name:'SEC Gold', color:'#FFB800'},
  {id:'neon-mint', name:'Neon Mint', color:'#00FFA3'},
];
const screens = [
  ['launch','Launch / Loading'], ['role-choice','Role Choice'], ['entry','Sign In / Entry'],
  ['feed','For You Feed'], ['profile','Player Profile'], ['discovery','Scout Discovery'],
];
await mkdir(resolve(here, 'assets'), {recursive:true});
await mkdir(resolve(here, 'frames'), {recursive:true});
await mkdir(resolve(here, 'verification'), {recursive:true});
await copyFile(sourcePath, resolve(here, 'assets/legacy-source.svg'));

const browser = await chromium.launch({headless:true, args:['--single-process','--no-zygote']});
try {
  const page = await browser.newPage();
  const output = await page.evaluate(({original,source,integratedSource,sourceHash,palettes,screens}) => {
    const parser = new DOMParser();
    const originalDocument = parser.parseFromString(original, 'text/html');
    const legacy = parser.parseFromString(source, 'image/svg+xml');
    if (legacy.querySelector('parsererror') || legacy.querySelectorAll('path').length !== 4) throw Error('Invalid legacy source');
    const shapePaths = [...legacy.querySelectorAll('path')].map(p => p.getAttribute('d'));
    const shape = legacy.documentElement.cloneNode(true);
    shape.querySelectorAll('path').forEach(p => p.setAttribute('fill','currentColor'));
    shape.setAttribute('class','legacy-symbol');
    shape.setAttribute('data-legacy-node','5:625');
    shape.setAttribute('data-source-sha256',sourceHash);
    shape.setAttribute('aria-hidden','true');
    // Keep the existing 40 x 56 identity slots. SVG meet scaling is uniform.
    shape.setAttribute('width','40'); shape.setAttribute('height','56');
    shape.setAttribute('preserveAspectRatio','xMidYMid meet');
    const shapeMarkup = new XMLSerializer().serializeToString(shape);
    const wordmark = parser.parseFromString(integratedSource, 'image/svg+xml');
    const horizon = wordmark.documentElement.children[1];
    if (!horizon) throw Error('Missing embedded Horizon group');
    const replacement = wordmark.createElementNS('http://www.w3.org/2000/svg','g');
    replacement.setAttribute('data-legacy-node','5:625');
    replacement.setAttribute('data-source-sha256',sourceHash);
    replacement.setAttribute('transform','translate(14.4 4.6) scale(.5)');
    shape.querySelectorAll('path').forEach(p => replacement.append(p.cloneNode(true)));
    horizon.replaceWith(replacement); // Removes the Horizon paths AND their nested clip definitions.
    wordmark.documentElement.setAttribute('aria-label','E7TRAF — experimental, unapproved legacy integrated wordmark');
    const desc = wordmark.createElementNS('http://www.w3.org/2000/svg','desc');
    desc.textContent = 'Experimental and unapproved. E and RAF retain the r04 Space Grotesk 700 outlines. Legacy running-player paths from Owner source Figma 5:625; uniform scale 0.5, optical placement only. No Horizon clipping.';
    wordmark.documentElement.prepend(desc);
    wordmark.documentElement.querySelector('path').setAttribute('data-letter','E');
    wordmark.documentElement.lastElementChild.querySelector('path').setAttribute('data-letter','RAF');
    const wordmarkMarkup = new XMLSerializer().serializeToString(wordmark.documentElement);
    const templates = {};
    for (const identity of ['literal','integrated']) {
      const flowSet = originalDocument.querySelector(`[data-set="${identity}"]`);
      const productSet = originalDocument.querySelector(`[data-extension-set="${identity}"]`);
      for (const [id] of screens) {
        const set = ['launch','role-choice','entry'].includes(id) ? flowSet : productSet;
        const screen = set?.querySelector(`[data-screen="${id}"][data-palette="gold"]`);
        if (!screen) throw Error(`Missing original ${identity}/${id}`);
        templates[`${identity}-${id}`] = screen.outerHTML;
      }
    }
    // Same restrained refinement for every experimental palette. Onboarding
    // icons are already exact local Figma vectors and are left untouched.
    const smoothIcons = {
      play:'<path d="M9 5.7Q9 5 9.6 5.4L19.5 11.5Q20.3 12 19.5 12.5L9.6 18.6Q9 19 9 18.3Z"/>',
      save:'<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5L12 16.7l-6.5 3.8V5A1.5 1.5 0 0 1 7 3.5Z"/>',
      share:'<path d="M12 15V3.5m-4.5 4.5L12 3.5 16.5 8M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7"/>',
      folder:'<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5H10l2 2h7.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/><circle cx="14.5" cy="12" r="1.6"/><path d="M11.5 17a3 3 0 0 1 6 0"/>',
      settings:'<path d="M4 6h3m5 0h8M4 12h9m5 0h2M4 18h5m5 0h6"/><rect x="7" y="3.5" width="5" height="5" rx="1.25"/><rect x="13" y="9.5" width="5" height="5" rx="1.25"/><rect x="9" y="15.5" width="5" height="5" rx="1.25"/>',
    };
    const oldIconPaths = {
      'm9 5 11 7-11 7Z':'play', 'M6 3h12v18l-6-4-6 4Z':'save',
      'M12 15V3m-5 5 5-5 5 5M5 12v8h14v-8':'share',
      'M3 6h7l2 3h9v11H3Z':'folder', 'M4 6h16M4 12h16M4 18h16':'settings',
    };
    const createScreen = (identity,palette,id) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = templates[`${identity}-${id}`];
      const screen = wrapper.firstElementChild;
      screen.classList.replace('gold',palette.id);
      screen.classList.add('experimental');
      screen.dataset.palette = palette.id;
      screen.dataset.approval = 'experimental-unapproved';
      screen.setAttribute('aria-label',`${screens.find(([s])=>s===id)[1]} — ${palette.name} — ${identity} — experimental, unapproved`);
      screen.querySelectorAll('.launch-identity,.choice-symbol,.identity-slot,.mini-symbol').forEach(slot => {
        slot.innerHTML = shapeMarkup;
      });
      screen.querySelectorAll('.integrated-wordmark').forEach(svg => {
        const holder = document.createElement('div'); holder.innerHTML = wordmarkMarkup;
        svg.replaceWith(holder.firstElementChild);
      });
      screen.querySelectorAll('.product-icon').forEach(svg => {
        const name = oldIconPaths[svg.querySelector('path')?.getAttribute('d')];
        if (name) { svg.innerHTML = smoothIcons[name]; svg.dataset.refinedIcon = name; }
        if (name === 'play' && svg.closest('.product-nav')) {
          svg.innerHTML = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/>';
        }
      });
      screen.querySelectorAll('[src]').forEach(e => {
        if (!/^(?:data:|https?:)/.test(e.getAttribute('src'))) e.setAttribute('src','../'+e.getAttribute('src'));
      });
      screen.querySelectorAll('[id],[for]').forEach(e => {
        for (const attr of ['id','for']) if (e.hasAttribute(attr)) e.setAttribute(attr,e.getAttribute(attr).replace('gold',palette.id));
      });
      // Repeated inline Figma icons carry SVG definition IDs. Scope them to
      // each copy so a browser never resolves a clip or gradient in another frame.
      screen.querySelectorAll('svg').forEach((svg,index) => {
        const ids = new Map([...svg.querySelectorAll('[id]')].map(e=>[e.id,`${identity}-${palette.id}-${id}-svg${index}-${e.id}`]));
        svg.querySelectorAll('*').forEach(e=>{
          for(const attr of [...e.attributes]){
            let value=attr.value;
            if(attr.name==='id' && ids.has(value))value=ids.get(value);
            for(const [before,after] of ids){
              value=value.replaceAll(`url(#${before})`,`url(#${after})`);
              if(value===`#${before}`)value=`#${after}`;
            }
            if(value!==attr.value)e.setAttribute(attr.name,value);
          }
        });
      });
      if (screen.querySelector('[data-final-horizon]')) throw Error('Horizon remains in experiment');
      const nodes = screen.querySelectorAll('[data-legacy-node="5:625"]');
      for (const node of nodes) {
        const paths = [...node.querySelectorAll('path')].map(p=>p.getAttribute('d'));
        if (paths.length && JSON.stringify(paths)!==JSON.stringify(shapePaths)) throw Error('Legacy path geometry changed');
      }
      return screen.outerHTML;
    };
    const flow = (identity,palette) => `<div class="palette-flow experimental-flow ${palette.id}" data-experiment-palette="${palette.id}"><h3><i class="swatch" aria-hidden="true"></i>${palette.name} <span>${palette.color}</span><span class="experiment-badge">Experimental · unapproved</span></h3>${[screens.slice(0,3),screens.slice(3)].map(row=>`<div class="flow-row">${row.map(([id,label])=>`<section class="review-column" data-experimental-frame="${identity}-${palette.id}-${id}" ${['feed','profile','discovery'].includes(id)?`data-extension-frame="${identity}-${palette.id}-${id}"`:''}><h4 class="frame-label">${screens.findIndex(([s])=>s===id)+1} · ${label}<small>${identity==='literal'?'A · Literal E7TRAF':'B · Integrated legacy symbol'} · experimental, unapproved</small></h4>${createScreen(identity,palette,id)}</section>`).join('')}</div>`).join('')}</div>`;
    const sets = ['literal','integrated'].map(identity=>`<section class="owner-section" id="${identity}"><h2>${identity==='literal'?'A · Literal E7TRAF':'B · Integrated E + legacy symbol + RAF'}</h2><p class="section-note">All six screens in each experimental palette. Layout, content and review controls follow the existing r04 experience.</p><div class="zoom-region"><div class="set-board" data-experimental-set="${identity}">${palettes.map(p=>flow(identity,p)).join('')}</div></div><p class="artifact-links"><a href="comparison-${identity}.png">Open full-resolution comparison</a></p></section>`).join('');
    const proofs = `<section class="owner-section" id="wordmarks"><h2>C · Wordmark comparisons</h2><p class="section-note">Literal and Integrated at standard and small sizes. Legacy symbol geometry is identical in every palette.</p><div class="zoom-region"><div class="wordmark-board" data-comparison="wordmarks"><div class="wordmark-head"><div>Literal E7TRAF</div><div>Integrated legacy symbol · unapproved</div></div>${palettes.map(p=>`<div class="wordmark-row experimental ${p.id}"><h3>${p.name}<small>${p.color} · experimental, unapproved</small></h3>${['','small-proof'].map(size=>`<div class="wordmark-pair ${size}"><div><span class="literal-proof">E7TRAF</span></div><div>${wordmarkMarkup}</div></div>`).join('')}</div>`).join('')}<p class="fine-print">Owner-provided legacy running-player symbol · Figma 5:625. Color and integrated-wordmark studies remain experimental and unapproved.</p></div></div><p class="artifact-links"><a href="wordmark-comparison.png">Open wordmark comparison</a></p></section>`;
    return {sets,proofs,wordmarkMarkup,shapeMarkup,templates};
  }, {original,source,integratedSource,sourceHash,palettes,screens});
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E7TRAF · Experimental Client Review · Legacy logo</title><link rel="stylesheet" href="../design.css"><link rel="stylesheet" href="../package.css"><link rel="stylesheet" href="../extension/product.css"><link rel="stylesheet" href="experimental.css"></head><body><main class="owner-package"><header class="package-intro"><span class="experiment-badge">Experimental · unapproved</span><h1>Client Review · three additional palettes</h1><p class="flow-summary">Launch <span>→</span> Role Choice <span>→</span> Sign In <span>→</span> Product screens</p><p>Metric Amber · SEC Gold · Neon Mint<br>Owner-provided legacy running-player logo from Figma 5:625. Each palette includes the complete six-screen experience with Literal and Integrated comparisons.</p><nav class="section-nav"><a href="../index.html">Existing Gold / Blue review</a><a href="#literal">A · Literal</a><a href="#integrated">B · Integrated</a><a href="#wordmarks">C · Wordmark sizes</a><a href="comparison.html">D · Palette comparison</a></nav><div class="package-toolbar"><button data-zoom="fit">Fit width</button><button data-zoom="1">Actual size</button><button data-zoom="2">2× detail</button></div><p class="review-status" role="status" aria-live="polite">Visual review only. Role choice and sign-in controls preview presentation; no authentication or account permissions are connected.</p><p class="extension-status" role="status" aria-live="polite">Product controls preview states only. No playback, search, persistence or contact request is connected.</p></header>${output.sets}${output.proofs}<footer class="package-footer">All three additional palettes and their integrated wordmarks are experimental and unapproved. Existing Gold/Blue screens and canonical Phase 01 decisions are preserved.</footer></main><script src="../review.js"></script><script src="../extension/review-products.js"></script></body></html>`;
  await writeFile(resolve(here,'index.html'),html);
  await writeFile(resolve(here,'assets/integrated-legacy.svg'),output.wordmarkMarkup+'\n');
  for (const p of palettes) {
    await writeFile(resolve(here,`assets/${p.id}-symbol.svg`),source.replaceAll('#0066FF',p.color));
    await writeFile(resolve(here,`assets/${p.id}-wordmark.svg`),output.wordmarkMarkup.replaceAll('currentColor',p.color)+'\n');
  }
  // Only add navigation to the original entry; existing markup is not reserialized.
  const link = '<a href="experiments/index.html" data-experimental-review-link>Experimental palettes · legacy logo</a>';
  if (!original.includes('data-experimental-review-link')) {
    await writeFile(resolve(review,'index.html'),original.replace('</nav><div class="package-toolbar">',link+'</nav><div class="package-toolbar">'));
  }
  await writeFile(resolve(here,'verification/build-manifest.json'),JSON.stringify({
    status:'experimental-unapproved', source:'references/brand/legacy-logo/SVG.svg', figmaNode:'5:625', sourceSha256:sourceHash,
    palettes, screens:screens.map(([id,label])=>({id,label})), identities:['literal','integrated'], screenPresentations:36,
    wordmark:{transform:'translate(14.4 4.6) scale(.5)',legacyClipPaths:0,lettering:'Original r04 E and RAF outlines unchanged'},
    sourceTemplates:output.templates,
    iconRefinements:['Rounded bookmark, share, folder and tune controls','Display-frame Feed navigation icon, matching the Figma smart_display role','Existing exact Figma onboarding icons retained'],
  },null,2)+'\n');
  console.log('Built three experimental palettes, six screens each, two wordmark presentations (36 frames).');
} finally { await browser.close(); }
