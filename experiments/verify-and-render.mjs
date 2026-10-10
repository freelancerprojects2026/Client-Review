import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import {dirname,resolve,extname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../../../specs/01-brand-identity-design-system/tooling/node_modules/playwright/index.mjs';

const here=dirname(fileURLToPath(import.meta.url)),review=resolve(here,'..'),workspace=resolve(here,'../../..');
const manifest=JSON.parse(await readFile(resolve(here,'verification/build-manifest.json'),'utf8'));
const identities=manifest.identities,palettes=manifest.palettes,screens=manifest.screens;
const render=!process.argv.includes('--verify-only');
const pagePrefix='/E7traf/client-review/r04/';
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.ttf':'font/ttf','.pdf':'application/pdf','.webm':'video/webm','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith(pagePrefix)) throw Error('Outside review bundle');
    let path=resolve(review,decodeURIComponent(url.pathname.slice(pagePrefix.length)));
    if(path!==review && !path.startsWith(review+'/')) throw Error('Outside review bundle');
    if((await stat(path)).isDirectory()) path=resolve(path,'index.html');
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const base=`http://127.0.0.1:${server.address().port}${pagePrefix}`;
const browser=await chromium.launch({headless:true,args:['--single-process','--no-zygote']});
const results={status:'experimental-unapproved',screenPresentations:36,palettes,frameSize:{width:390,height:917},checks:{},issues:[]};
const errors=[],externalRequests=[],failedResponses=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base)||url.startsWith('data:')) return route.continue();
    externalRequests.push(url);return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failedResponses.push({url:r.url(),status:r.status()});});
  await page.goto(base+'experiments/index.html');await page.evaluate(()=>document.fonts.ready);
  const structure=await page.evaluate(()=>({
    count:document.querySelectorAll('[data-experimental-frame]').length,
    uniqueIds:[...document.querySelectorAll('[id]')].map(e=>e.id),
    missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),
    horizons:document.querySelectorAll('[data-final-horizon]').length,
    invalidStatus:[...document.querySelectorAll('.screen')].filter(e=>e.dataset.approval!=='experimental-unapproved').length,
    fonts:[document.fonts.check('700 28px "Space Grotesk"'),document.fonts.check('400 14px "Plus Jakarta Sans"')],
  }));
  assert.equal(structure.count,36);assert.equal(new Set(structure.uniqueIds).size,structure.uniqueIds.length);
  assert.deepEqual(structure.missingImages,[]);assert.equal(structure.horizons,0);assert.equal(structure.invalidStatus,0);assert.ok(structure.fonts.every(Boolean));
  results.checks.structure=structure;
  const legacyPaths=await page.evaluate(()=>[...document.querySelector('.legacy-symbol').querySelectorAll('path')].map(p=>p.getAttribute('d')));
  const geometry=await page.evaluate(({identities,palettes,screens,legacyPaths})=>{
    const errors=[];
    const measures=(screen)=>{
      const origin=screen.getBoundingClientRect();
      return [...screen.querySelectorAll('*')].filter(e=>!e.closest('defs') && !['desc','title'].includes(e.tagName.toLowerCase())).map(e=>{
        const r=e.getBoundingClientRect();return [e.tagName,e.getAttribute('class'),...['x','y','width','height'].map(k=>Math.round((r[k]-(k==='x'?origin.x:k==='y'?origin.y:0))*1000)/1000)];
      });
    };
    for(const identity of identities) for(const {id} of screens) {
      const first=document.querySelector(`[data-experimental-frame="${identity}-${palettes[0].id}-${id}"] .screen`);
      const expected=measures(first);
      for(const palette of palettes) {
        const s=document.querySelector(`[data-experimental-frame="${identity}-${palette.id}-${id}"] .screen`);
        const actualMeasures=measures(s);
        const differences=actualMeasures.flatMap((m,index)=>{
          const e=expected[index];
          return !e||m[0]!==e[0]||m[1]!==e[1]||m.slice(2).some((v,k)=>Math.abs(v-e[k+2])>.02)?[{index,expected:e,actual:m}]:[];
        });
        if(actualMeasures.length!==expected.length||differences.length)errors.push({frame:`${identity}/${palette.id}/${id}`,differences:differences.slice(0,2)});
        if(s.offsetWidth!==390||s.offsetHeight!==917)errors.push('Wrong frame size');
        const actual=getComputedStyle(s).getPropertyValue('--accent').trim().toUpperCase();
        if(actual!==palette.color)errors.push(`Wrong accent ${actual}`);
        for(const logo of s.querySelectorAll('.legacy-symbol,[data-legacy-node="5:625"]')) {
          if(JSON.stringify([...logo.querySelectorAll('path')].map(p=>p.getAttribute('d')))!==JSON.stringify(legacyPaths))errors.push('Legacy paths differ');
          if(logo.querySelector('clipPath,[clip-path]'))errors.push('Inherited legacy clipping');
        }
        const wordmark=s.querySelector('.integrated-wordmark');
        if(wordmark) {
          const e=wordmark.querySelector('[data-letter="E"]').getBoundingClientRect();
          const symbol=wordmark.querySelector('[data-legacy-node]').getBoundingClientRect();
          const raf=wordmark.querySelector('[data-letter="RAF"]').getBoundingClientRect();
          if(e.right>=symbol.left||symbol.right>=raf.left)errors.push(`Wordmark overlap ${identity}/${palette.id}/${id}`);
          if(wordmark.querySelector('clipPath,[clip-path]'))errors.push('Horizon clipping remains');
        }
      }
    }
    return {errors,paletteGeometryMatches:true,legacyPathGeometryMatches:true,uniformWordmarkScale:0.5};
  },{identities,palettes,screens,legacyPaths});
  assert.deepEqual(geometry.errors,[]);results.checks.geometry=geometry;
  // Compare layout anchors and content to the preserved six-screen r04 sources.
  const originalPage=await context.newPage();await originalPage.goto(base+'index.html');await originalPage.evaluate(()=>document.fonts.ready);
  const layoutSelectors=['.brand-lockup','.brand-name','.launch-identity','.choice-identity','.choice-heading','.role-cards','.role-card','.guest-action','.choice-continue','.role-selector','.auth-card','.auth-form','.field-shell','.providers','.provider-divider','.signup','.app-header','.app-brand','.mini-symbol','.mini-wordmark','.app-section','.tabs','.feed-poster','.feed-actions','.feed-context','.product-nav','.profile-hero','.profile-facts','.section-heading','.score-state','.profile-videos','.video-row','.contact-note','.contact-cta','.discovery-heading','.discovery-filters','.discovery-card','.spotlight-meta','.spotlight-actions'];
  const measureSources=await originalPage.evaluate(({identities,screens,layoutSelectors})=>{
    const result={};
    for(const identity of identities)for(const {id} of screens){
      const section=['launch','role-choice','entry'].includes(id)?`[data-set="${identity}"]`:`[data-extension-set="${identity}"]`;
      const s=document.querySelector(`${section} .screen[data-screen="${id}"][data-palette="gold"]`),origin=s.getBoundingClientRect();
      result[`${identity}-${id}`]={text:s.innerText.replace(/\s+/g,' ').trim(),anchors:layoutSelectors.flatMap(sel=>[...s.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return [sel,...['x','y','width','height'].map(k=>Math.round((r[k]-(k==='x'?origin.x:k==='y'?origin.y:0))*1000)/1000)];}))};
    }return result;
  },{identities,screens,layoutSelectors});
  const preservedLayout=await page.evaluate(({identities,screens,palette,layoutSelectors,measureSources})=>{
    const problems=[];
    for(const identity of identities)for(const {id} of screens){
      const s=document.querySelector(`[data-experimental-frame="${identity}-${palette}-${id}"] .screen`),origin=s.getBoundingClientRect();
      const anchors=layoutSelectors.flatMap(sel=>[...s.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return [sel,...['x','y','width','height'].map(k=>Math.round((r[k]-(k==='x'?origin.x:k==='y'?origin.y:0))*1000)/1000)];}));
      const expected=measureSources[`${identity}-${id}`];
      if(JSON.stringify(anchors)!==JSON.stringify(expected.anchors))problems.push(`Layout anchor mismatch ${identity}/${id}`);
      if(s.innerText.replace(/\s+/g,' ').trim()!==expected.text)problems.push(`Content mismatch ${identity}/${id}`);
    }return problems;
  },{identities,screens,palette:palettes[0].id,layoutSelectors,measureSources});
  assert.deepEqual(preservedLayout,[]);results.checks.r04LayoutAndContentPreserved=true;await originalPage.close();
  const interactions=await page.evaluate(({identities,palettes})=>{
    const fail=[],get=(i,p,id)=>document.querySelector(`[data-experimental-frame="${i}-${p}-${id}"] .screen`);
    const expect=(ok,msg)=>{if(!ok)fail.push(msg);};
    const scroll=Element.prototype.scrollIntoView;let scrolled=null;
    Element.prototype.scrollIntoView=function(){scrolled=this;};
    try {
      for(const identity of identities)for(const palette of palettes){
        const p=palette.id,choice=get(identity,p,'role-choice'),entry=get(identity,p,'entry');
        choice.querySelector('[data-role="scout"]').click();
        expect(choice.querySelector('[data-role="scout"]').getAttribute('aria-pressed')==='true','Scout role choice');
        choice.querySelector('.choice-continue').click();
        expect(entry.querySelector('[data-audience="scout"]').getAttribute('aria-pressed')==='true','Continue audience');
        expect(scrolled===entry,'Continue points to matching entry');
        choice.querySelector('.guest-action').click();expect(document.querySelector('.review-status').textContent.includes('Guest'),'Guest preview');
        const password=entry.querySelector('.password-input');password.value='review-only';entry.querySelector('.eye-toggle').click();expect(password.type==='text','Reveal password');entry.querySelector('.eye-toggle').click();expect(password.type==='password','Hide password');
        entry.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(document.querySelector('.review-status').textContent.includes('no request'),'Submit preview');
        entry.querySelector('[data-review-action="Google sign-in"]').click();expect(document.querySelector('.review-status').textContent.includes('Google'),'Provider preview');
        const feed=get(identity,p,'feed'),profile=get(identity,p,'profile'),discovery=get(identity,p,'discovery');
        feed.querySelector('[data-product-action="Rising feed"]').click();expect(feed.querySelector('[data-product-action="Rising feed"]').getAttribute('aria-pressed')==='true','Rising tab');
        const like=feed.querySelector('[data-product-action="Like video"]');like.click();expect(like.getAttribute('aria-pressed')==='true','Like preview');like.click();expect(like.getAttribute('aria-pressed')==='false','Like toggled off');
        const save=discovery.querySelector('[data-product-action="Save Player"]');save.click();expect(save.getAttribute('aria-pressed')==='true','Save player');
        discovery.querySelector('[data-product-target="profile"]').click();expect(scrolled===profile,'Profile navigation stays in palette and identity');
        feed.querySelector('[data-product-target="discovery"]').click();expect(scrolled===discovery,'Discovery navigation stays in palette and identity');
        profile.querySelector('[data-product-action="Admin-mediated Contact Request"]').click();expect(document.querySelector('.extension-status').textContent.includes('no request is sent'),'Admin contact preview');
      }
    }finally{Element.prototype.scrollIntoView=scroll;}
    return {errors:fail,paletteIdentityPairs:6};
  },{identities,palettes});
  assert.deepEqual(interactions.errors,[]);results.checks.interactions=interactions;
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-zoom="fit"]').click();
  const zoom=await page.evaluate(()=>({
    fitPressed:document.querySelector('[data-zoom="fit"]').getAttribute('aria-pressed')==='true',
    noPageOverflow:document.documentElement.scrollWidth<=390,
    allBoardsFit:[...document.querySelectorAll('.zoom-region')].every(r=>r.firstElementChild.getBoundingClientRect().width<=r.clientWidth+1),
  }));
  assert.ok(zoom.fitPressed&&zoom.noPageOverflow&&zoom.allBoardsFit);results.checks.mobileReviewFit=zoom;
  const keyboardRole=page.locator('[data-experimental-frame="literal-metric-amber-role-choice"] [data-role="player"]');
  await keyboardRole.focus();await keyboardRole.press('Enter');assert.equal(await keyboardRole.getAttribute('aria-pressed'),'true');
  results.checks.keyboardRoleSelection=true;
  await page.setViewportSize({width:1440,height:1100});
  await page.reload();await page.evaluate(()=>document.fonts.ready);
  if(render)for(const identity of identities)for(const palette of palettes)for(const {id} of screens){
    const name=`${identity}-${palette.id}-${id}`;
    await page.locator(`[data-experimental-frame="${name}"] .screen`).screenshot({path:resolve(here,`frames/${name}.png`)});
  }
  if(render)for(const identity of identities){
    await page.locator(`[data-experimental-set="${identity}"]`).screenshot({path:resolve(here,`comparison-${identity}.png`)});
  }
  if(render)await page.locator('[data-comparison="wordmarks"]').screenshot({path:resolve(here,'wordmark-comparison.png')});
  const imageBoard=identity=>`<section class="owner-section" id="${identity}"><h2>${identity==='literal'?'A · Literal E7TRAF':'B · Integrated legacy symbol'}</h2><p class="section-note">Three experimental palettes · identical geometry · all six screens</p><div class="zoom-region"><div class="set-board" data-palette-comparison="${identity}">${screens.map(({id,label})=>`<div class="palette-flow"><h3>${label}</h3><div class="flow-row">${palettes.map(p=>`<section class="review-column"><h4 class="frame-label">${p.name}<small>${p.color} · experimental, unapproved</small></h4><img src="frames/${identity}-${p.id}-${id}.png" width="390" height="917" alt="${label}, ${p.name}, ${identity} legacy wordmark presentation"></section>`).join('')}</div></div>`).join('')}</div></div></section>`;
  const comparison=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E7TRAF · Experimental palette comparison</title><link rel="stylesheet" href="../design.css"><link rel="stylesheet" href="../package.css"><link rel="stylesheet" href="experimental.css"></head><body><main class="owner-package"><header class="package-intro"><span class="experiment-badge">Experimental · unapproved</span><h1>Palette comparison · all six screens</h1><p>Metric Amber · SEC Gold · Neon Mint · legacy running-player logo</p><nav class="section-nav"><a href="index.html">Interactive experimental review</a><a href="../index.html">Existing Gold / Blue</a><a href="#literal">Literal</a><a href="#integrated">Integrated</a><a href="palette-comparison-literal.png">Literal contact sheet</a><a href="palette-comparison-integrated.png">Integrated contact sheet</a></nav><div class="package-toolbar"><button data-zoom="fit">Fit width</button><button data-zoom="1">Actual size</button><button data-zoom="2">2× detail</button></div></header>${identities.map(imageBoard).join('')}</main><script src="../review.js"></script></body></html>`;
  await writeFile(resolve(here,'comparison.html'),comparison);
  await page.goto(base+'experiments/comparison.html');await page.evaluate(()=>document.fonts.ready);
  if(render)for(const identity of identities)await page.locator(`[data-palette-comparison="${identity}"]`).screenshot({path:resolve(here,`palette-comparison-${identity}.png`)});
  const createGallery=async(dir,title,back='../index.html')=>{
    const files=(await readdir(dir)).filter(f=>f.endsWith('.png')).sort();
    await writeFile(resolve(dir,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{background:#101114;color:#eef0f4;font:16px/1.6 sans-serif;padding:24px}a{color:#d9e1ed}main{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{width:195px;height:auto;display:block}figcaption{max-width:195px}</style></head><body><h1>${title}</h1><p><a href="${back}">Back to review</a></p><main>${files.map(f=>`<figure><a href="${f}"><img src="${f}" alt="${f.replace('.png','').replaceAll('-',' ')}"></a><figcaption><a href="${f}">${f}</a></figcaption></figure>`).join('')}</main></body></html>`);
  };
  await createGallery(resolve(here,'frames'),'Experimental and unapproved · individual screens');
  // GitHub Pages has no directory listing; explicit galleries keep the frame
  // links usable. These navigation indexes do not change the rendered screens.
  await createGallery(resolve(review,'frames'),'Existing r04 review frames');
  await createGallery(resolve(review,'extension/frames'),'Existing r04 product review frames','../../index.html#extension-start');
  // Resolve every HTML/CSS runtime asset and link from the standalone bundle,
  // including the repository subpath used by GitHub Pages.
  const runtime=[];
  async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){
    const p=resolve(dir,e.name);if(e.isDirectory())await collect(p);else if(/\.(html|css)$/.test(e.name))runtime.push(p);
  }}
  await collect(review);const assetLinks=[];
  for(const path of runtime){
    const body=await readFile(path,'utf8');
    const documentURL=base+relative(review,path);
    const baseHref=body.match(/<base\b[^>]*href=["']([^"']+)["']/)?.[1];
    const assetBase=baseHref?new URL(baseHref,documentURL):documentURL;
    const refs=[...body.replace(/<base\b[^>]*>/g,'').matchAll(/(?:src|href|poster)=["']([^"']+)["']/g)].map(m=>m[1]);
    refs.push(...[...body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m=>m[1]));
    for(const ref of refs){
      if(ref.startsWith('#')||ref.startsWith('data:'))continue;
      if(/^(?:https?:|\/\/|file:|\/)/.test(ref)){if(!ref.startsWith('http://www.w3.org/'))assetLinks.push({path:relative(review,path),ref,error:'Nonrelative dependency'});continue;}
      const url=new URL(ref,assetBase);
      if(!url.pathname.startsWith(pagePrefix)){assetLinks.push({path:relative(review,path),ref,error:'Escapes bundle'});continue;}
      const response=await fetch(url);
      if(!response.ok)assetLinks.push({path:relative(review,path),ref,error:response.status});
      if(url.hash && response.ok && /\.html$/.test(url.pathname)){
        const target=await response.text();
        if(!target.includes(`id="${url.hash.slice(1)}"`))assetLinks.push({path:relative(review,path),ref,error:'Missing fragment target'});
      }
    }
  }
  assert.deepEqual(assetLinks,[]);results.checks.githubPages={prefix:pagePrefix,runtimeFiles:runtime.length,brokenLinks:assetLinks,externalRequests};
  assert.deepEqual(externalRequests,[]);assert.deepEqual(errors,[]);assert.deepEqual(failedResponses,[]);
  results.checks.browser={errors,failedResponses,fontsAndImagesLoaded:true};
  // Verify all pre-existing client, reference, approval and evidence files.
  const baseline=JSON.parse(await readFile(resolve(here,'verification/preservation-baseline.json'),'utf8'));
  const changed=[],navigationIndexesChanged=[];let checked=0;
  for(const [path,hash] of Object.entries(baseline)){
    let bytes=await readFile(resolve(workspace,path));
    if(path==='client-review/r04/index.html')bytes=Buffer.from(bytes.toString().replace('<a href="experiments/index.html" data-experimental-review-link>Experimental palettes · legacy logo</a>',''));
    if(createHash('sha256').update(bytes).digest('hex')!==hash){
      if(['client-review/r04/frames/index.html','client-review/r04/extension/frames/index.html'].includes(path))navigationIndexesChanged.push(path);
      else changed.push(path);
    }checked++;
  }
  assert.deepEqual(changed,[]);results.checks.preservation={preExistingFilesChecked:checked,screenAssetOrCanonicalFilesChanged:changed,navigationIndexesChanged,entryChange:'One link to the experimental review; existing markup byte-identical after removing that link'};
  await writeFile(resolve(here,'verification/results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({frames:36,checks:results.checks,issues:results.issues},null,2));
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
