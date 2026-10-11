import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '../../../specs/01-brand-identity-design-system/tooling/node_modules/playwright/index.mjs';
import {decodePNG} from '../../../specs/01-brand-identity-design-system/tooling/scripts/lib/png-pixels.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const output = resolve(here, 'verification/metric-revised-v2');
const hash = value => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(await readFile(resolve(here, 'verification/metric-revised-v2-baseline.json'), 'utf8'));
const result = {status:'Owner review · unapproved', checks:{}, screens:[]};
const stripAdditions = html => html
  .replace(/<!-- Metric revised V2 variant: start -->[\s\S]*?<!-- Metric revised V2 variant: end -->/, '')
  .replace(/<a [^>]*data-metric-revised-link>[\s\S]*?<\/a>/g, '');
for (const [file, expected] of Object.entries(baseline)) {
  const bytes = await readFile(resolve(root, file));
  const actual = ['client-review/r04/index.html', 'client-review/r04/experiments/index.html'].includes(file) ? stripAdditions(bytes.toString()) : bytes;
  assert.equal(hash(actual), expected, `Previous content changed: ${file}`);
}
result.checks.preservation = {existingFilesChecked:Object.keys(baseline).length, originalHtmlByteIdenticalAfterRemovingAdditions:true};
const html = await readFile(resolve(here, 'index.html'), 'utf8');
const mainHtml = await readFile(resolve(here, '../index.html'), 'utf8');
const count = text => (text.match(/<article class="screen\b/g) || []).length;
result.pageCounts = {metricPresentation:{before:count(stripAdditions(html)), after:count(html)}, mainReview:{before:count(stripAdditions(mainHtml)), after:count(mainHtml)}, combined:{before:count(stripAdditions(html))+count(stripAdditions(mainHtml)), after:count(html)+count(mainHtml)}};
assert.deepEqual(result.pageCounts.metricPresentation, {before:36, after:42});
assert.deepEqual(result.pageCounts.mainReview, {before:28, after:28});
const source = await readFile(resolve(root, 'E7TRAF-Logo-Revision/E7TRAF-Logo-Edited-V2.svg'), 'utf8');
assert.equal(await readFile(resolve(here, 'assets/E7TRAF-Logo-Edited-V2.svg'), 'utf8'), source);
result.logo = {source:'E7TRAF-Logo-Revision/E7TRAF-Logo-Edited-V2.svg', sha256:hash(source), sourceCopyByteIdentical:true};
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true});
const errors = [], failedResponses = [], externalRequests = [];
try {
  const context = await browser.newContext({viewport:{width:1440,height:1100}, deviceScaleFactor:2, reducedMotion:'reduce'});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('data:')) return route.continue();
    externalRequests.push(url); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) failedResponses.push(response.url());});
  await page.goto(pathToFileURL(resolve(here, 'index.html')).href);
  await page.evaluate(() => document.fonts.ready);
  const structure = await page.evaluate(({source, sourceHash}) => {
    const section = document.querySelector('#metric-revised-v2');
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    const paths = [...parsed.querySelectorAll('path')].map(path => path.getAttribute('d'));
    const logos = [...section.querySelectorAll('.revised-symbol')];
    const validGeometry = logos.every(svg => {
      const bbox = svg.getBBox(), matrix = svg.getScreenCTM();
      return JSON.stringify([...svg.querySelectorAll('path')].map(path => path.getAttribute('d'))) === JSON.stringify(paths)
        && svg.getAttribute('viewBox') === parsed.getAttribute('viewBox')
        && svg.getAttribute('preserveAspectRatio') === 'xMidYMid meet'
        && svg.dataset.sourceSha256 === sourceHash
        && svg.querySelectorAll('path[fill="currentColor"]').length === 4
        && !svg.querySelector('clipPath,[clip-path]')
        && Math.abs(matrix.a - matrix.d) < .00001 && matrix.b === 0 && matrix.c === 0
        && bbox.x >= 0 && bbox.y >= 0 && bbox.x+bbox.width <= 48 && bbox.y+bbox.height <= 48;
    });
    return {newPages:section.querySelectorAll('.screen').length, totalPages:document.querySelectorAll('.screen').length,
      uniqueIds:ids.length === new Set(ids).size, revisedLogoInstances:logos.length, validGeometry,
      oldMetricPages:document.querySelectorAll('#literal .metric-amber .screen, #integrated .metric-amber .screen').length,
      missingImages:[...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
      fontsLoaded:document.fonts.check('700 28px "Space Grotesk"') && document.fonts.check('400 14px "Plus Jakarta Sans"'),
      frameSizes:[...section.querySelectorAll('.screen')].map(screen => [screen.offsetWidth,screen.offsetHeight]),
      labels:[...section.querySelectorAll('.frame-label')].map(label => label.firstChild.textContent.trim()),
      formLabelsValid:[...section.querySelectorAll('label[for]')].every(label => section.contains(document.getElementById(label.htmlFor)))
    };
  }, {source, sourceHash:hash(source)});
  assert.equal(structure.newPages,6); assert.equal(structure.totalPages,42);
  assert.equal(structure.revisedLogoInstances,6); assert.equal(structure.oldMetricPages,12);
  assert.ok(structure.uniqueIds && structure.validGeometry && structure.fontsLoaded && structure.formLabelsValid);
  assert.deepEqual(structure.missingImages,[]); assert.ok(structure.frameSizes.every(size => size[0] === 390 && size[1] === 917));
  result.checks.structureAndGeometry = structure;
  const screenIds = ['launch','role-choice','entry','feed','profile','discovery'];
  const tokenNames = ['--base','--surface','--raised','--line','--text','--accent','--accent-rgb','--accent-soft','--tactical'];
  for (const id of screenIds) {
    const oldSelector = `#literal .metric-amber [data-screen="${id}"]`;
    const newSelector = `#metric-revised-v2 [data-screen="${id}"]`;
    const comparison = await page.evaluate(({oldSelector,newSelector,tokenNames}) => {
      const before = document.querySelector(oldSelector), after = document.querySelector(newSelector);
      const tokens = screen => tokenNames.map(name => [name,getComputedStyle(screen).getPropertyValue(name).trim()]);
      const anchors = screen => {
        const origin = screen.getBoundingClientRect();
        return [...screen.querySelectorAll('*')].filter(node => !node.closest('svg')).map(node => {
          const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
          return [node.tagName,node.className,...['x','y','width','height'].map(key => Math.round((rect[key]-(key==='x'?origin.x:key==='y'?origin.y:0))*100)/100),css.fontFamily,css.fontSize,css.color,css.backgroundColor];
        });
      };
      return {oldTokens:tokens(before),newTokens:tokens(after),oldAnchors:anchors(before),newAnchors:anchors(after),oldContent:before.innerText,newContent:after.innerText};
    }, {oldSelector,newSelector,tokenNames});
    assert.deepEqual(comparison.newTokens,comparison.oldTokens,`${id}: Metric palette changed`);
    assert.deepEqual(comparison.newAnchors,comparison.oldAnchors,`${id}: layout or typography changed`);
    assert.equal(comparison.newContent,comparison.oldContent,`${id}: content changed`);
    // Render both at the same viewport origin to avoid document-offset glyph rasterization.
    await page.evaluate(selector => {
      const mount=document.createElement('div'); mount.id='metric-visual-check';
      mount.style.cssText='position:fixed;left:0;top:0;width:390px;height:917px;z-index:99999';
      const screen=document.querySelector(selector).cloneNode(true);
      screen.querySelector('.legacy-symbol').style.visibility='hidden';
      mount.append(screen); document.body.append(mount);
    },oldSelector);
    const beforePixels = await page.locator('#metric-visual-check .screen').screenshot({animations:'disabled'});
    await page.evaluate(selector => {
      const screen=document.querySelector(selector).cloneNode(true);
      screen.querySelector('.revised-symbol').style.visibility='hidden';
      document.querySelector('#metric-visual-check').replaceChildren(screen);
    },newSelector);
    const afterPixels = await page.locator('#metric-visual-check .screen').screenshot({animations:'disabled'});
    let maximumChannelDifference=0;
    if (hash(afterPixels)!==hash(beforePixels)) {
      const before=decodePNG(beforePixels), after=decodePNG(afterPixels);
      assert.equal(before.width,after.width); assert.equal(before.height,after.height);
      for(let y=0;y<before.height;y++) for(let x=0;x<before.width;x++) {
        const a=before.pixel(x,y),b=after.pixel(x,y);
        for(const offset of [1,3,5]) maximumChannelDifference=Math.max(maximumChannelDifference,Math.abs(parseInt(a.slice(offset,offset+2),16)-parseInt(b.slice(offset,offset+2),16)));
      }
    }
    // Chromium rounds blurred glow layers slightly differently at document offsets.
    assert.ok(maximumChannelDifference<=1,`${id}: visual change outside logo (RGB delta ${maximumChannelDifference})`);
    await page.locator('#metric-visual-check').evaluate(mount => mount.remove());
    await page.locator(newSelector).screenshot({path:resolve(output,`${id}.png`),animations:'disabled'});
    result.screens.push({id,dimensions:'390 × 917',metricTokensMatch:true,layoutAndTypographyMatch:true,contentMatches:true,maximumChannelDifferenceOutsideLogo:maximumChannelDifference,rasterTolerance:1});
  }
  // Capture the whole six-page board before exercising demo state.
  await page.locator('#metric-revised-v2 .set-board').screenshot({path:resolve(output,'six-pages.png'),animations:'disabled',scale:'css'});
  for (const id of screenIds) {
    await page.locator(`#metric-revised-v2 nav a[href="#metric-revised-v2-${id}"]`).click();
    assert.equal(new URL(page.url()).hash,`#metric-revised-v2-${id}`);
  }
  const newChoice = page.locator('#metric-revised-v2 .role-choice');
  const newEntry = page.locator('#metric-revised-v2 .entry');
  await newChoice.locator('[data-role="scout"]').click();
  await newChoice.locator('.choice-continue').click();
  assert.equal(await newEntry.locator('[data-audience="scout"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#literal .metric-amber .entry [data-audience="player"]').getAttribute('aria-pressed'),'true');
  await newEntry.locator('.eye-toggle').click();
  assert.equal(await newEntry.locator('.password-input').getAttribute('type'),'text');
  await newEntry.locator('.eye-toggle').click();
  assert.equal(await newEntry.locator('.password-input').getAttribute('type'),'password');
  await newEntry.locator('[data-review-action]').first().click();
  assert.match(await page.locator('.review-status').innerText(),/visual review control/);
  const newDiscovery = page.locator('#metric-revised-v2 [data-screen="discovery"]');
  // Assert navigation resolves to the revised variant, including across its two rows.
  await page.evaluate(() => {
    window.metricNavigationTargets=[];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(...args){window.metricNavigationTargets.push(this.closest('[data-experimental-frame]')?.dataset.experimentalFrame); return original.apply(this,args);};
  });
  await newDiscovery.locator('[data-product-target="profile"]').first().click();
  assert.equal(await page.evaluate(() => window.metricNavigationTargets.at(-1)),'literal-revised-v2-metric-amber-profile');
  await newDiscovery.locator('[data-product-target="feed"]').click();
  assert.equal(await page.evaluate(() => window.metricNavigationTargets.at(-1)),'literal-revised-v2-metric-amber-feed');
  await page.locator('#metric-revised-v2 [data-screen="profile"] [data-product-target="discovery"]').click();
  assert.equal(await page.evaluate(() => window.metricNavigationTargets.at(-1)),'literal-revised-v2-metric-amber-discovery');
  await newDiscovery.locator('[data-product-action="Save Player"]').click();
  assert.equal(await newDiscovery.locator('[data-product-action="Save Player"]').getAttribute('aria-pressed'),'true');
  await page.locator('#metric-revised-v2 [data-screen="feed"] [data-product-action="Rising feed"]').click();
  assert.equal(await page.locator('#metric-revised-v2 [data-screen="feed"] [data-product-action="Rising feed"]').getAttribute('aria-pressed'),'true');
  result.checks.controls = {roleChoiceAndSignIn:true,passwordVisibility:true,reviewActions:true,productNavigationStaysInVariant:true,saveState:true,feedTabs:true,oldMetricStateUnaffected:true};
  result.checks.responsive=[];
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.locator('[data-zoom="fit"]').click();
    const fit = await page.evaluate(() => {
      const region=document.querySelector('#metric-revised-v2 .zoom-region'), board=region.firstElementChild;
      return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,availableWidth:region.clientWidth,boardWidth:board.getBoundingClientRect().width,
        fitSelected:document.querySelector('[data-zoom="fit"]').getAttribute('aria-pressed'),frames:board.querySelectorAll('.screen').length};
    });
    assert.ok(fit.documentWidth <= width, `Document overflows at ${width}`);
    assert.ok(fit.boardWidth <= fit.availableWidth+.1); assert.equal(fit.frames,6); assert.equal(fit.fitSelected,'true');
    for (const zoom of ['1','2']) {
      await page.locator(`[data-zoom="${zoom}"]`).click();
      const actual = await page.locator('#metric-revised-v2 .set-board').evaluate(board => new DOMMatrix(getComputedStyle(board).transform).a);
      assert.equal(actual,Number(zoom));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    result.checks.responsive.push({...fit,actualSizeAndDoubleZoom:true});
    if (width===390) {
      await page.locator('[data-zoom="fit"]').click();
      await page.locator('a[data-metric-revised-link]').click();
      await page.screenshot({path:resolve(output,'mobile-fit.png'),animations:'disabled'});
    }
  }
  await page.goto(pathToFileURL(resolve(here,'../index.html')).href);
  await page.locator('a[data-metric-revised-link]').click();
  assert.equal(new URL(page.url()).hash,'#metric-revised-v2');
  assert.equal(await page.locator('#metric-revised-v2 .screen').count(),6);
  result.checks.mainNavigation=true;
  assert.deepEqual(errors,[]); assert.deepEqual(failedResponses,[]); assert.deepEqual(externalRequests,[]);
  result.checks.runtime={errors,failedResponses,externalRequests};
  result.result='PASS';
  await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({result:result.result,pageCounts:result.pageCounts,verifiedScreens:result.screens.length,preservedFiles:result.checks.preservation.existingFilesChecked,viewports:result.checks.responsive.map(item=>item.viewport),evidence:output},null,2));
} finally {
  await browser.close();
}
