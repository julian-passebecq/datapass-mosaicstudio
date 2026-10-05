/** Browser qualification for the Animated Coding Lab. Run after: npm run build:client -- animated-coding-lab
 * Serves dist-clients/animated-coding-lab with the production CSP and checks, against the committed trace artifact:
 * step through, scrub, line highlight == recorded line for EVERY step, focus line, complete transcript, play/pause,
 * deterministic snapshots (same step reached two ways -> identical SVG and pixels), reduced motion, 390 px,
 * lineage page, emitted-JS budget and two stable framework captures (client:capture) of the same saved state.
 * Writes stills to clients/animated-coding-lab/stills/.
 */
import {createServer} from 'node:http';
import {readFile, readdir, mkdir, rm} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash as hash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const ID = 'animated-coding-lab', BUDGET = 185 * 1024;
const root = path.resolve('dist-clients', ID), stills = path.resolve('clients', ID, 'stills');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain'};
const csp = "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const trace = JSON.parse(await readFile(path.join('clients', ID, 'public/artifacts/coding-lab-trace.json'), 'utf8')).payload.rows;
const sha = bytes => hash('sha256').update(bytes).digest('hex');

// Emitted-JS budget: sum of separately gzipped chunks (same metric as check-client-performance.mjs).
const assets = (await readdir(path.join(root, 'assets'))).filter(f => f.endsWith('.js'));
let gzip = 0;
for (const file of assets) gzip += gzipSync(await readFile(path.join(root, 'assets', file))).length;
assert.ok(gzip <= BUDGET, `emitted JS ${gzip} > budget ${BUDGET}`);
const build = JSON.parse(await readFile(path.join(root, 'studio-build.json'), 'utf8'));
assert.equal(build.containsThree, false, 'the lab must not ship Three.js');
assert.deepEqual(build.capabilities, ['motion']);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  try {const body = await readFile(file); res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp}); res.end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({...(process.env.CI_BROWSER_PATH ? {executablePath: process.env.CI_BROWSER_PATH} : {})});
await mkdir(stills, {recursive: true});
const watch = page => {const errors = []; page.on('console', m => {if (m.type() === 'error') errors.push(m.text());}); page.on('pageerror', e => errors.push(String(e))); return errors;};
const settled = page => page.waitForFunction(() => document.querySelector('[data-testid=motion-svg]')?.getAttribute('data-animating') !== 'true');
const step = async page => Number(await page.getByTestId('coding-lab').getAttribute('data-step'));
const scrub = async (page, value) => {await page.getByTestId('lab-scrubber').fill(String(value)); await settled(page);};

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1, reducedMotion: 'no-preference'});
  const page = await context.newPage(), errors = watch(page);
  await page.goto(base);
  const lab = page.getByTestId('coding-lab'); await lab.waitFor({timeout: 30000});
  assert.equal(await page.getByTestId('lab-counter').innerText(), `1 / ${trace.length}`);

  // 1. Step through with the buttons: the player advances one recorded step at a time.
  for (let i = 1; i <= 5; i++) {await page.getByTestId('lab-next').click(); await settled(page); assert.equal(await step(page), i);}
  await page.getByTestId('lab-prev').click(); await settled(page); assert.equal(await step(page), 4);

  // 2. Every step: highlighted code line, explanation source line and SVG target == the recorded row.
  for (const row of trace) {
    await scrub(page, row.step);
    assert.equal(await lab.getAttribute('data-line'), String(row.line), 'lab line at step ' + row.step);
    const active = page.locator('[data-testid=lab-code] li[data-current=true]');
    assert.equal(await active.count(), 1); assert.equal(await active.getAttribute('data-line'), String(row.line));
    assert.equal((await active.locator('code').innerText()).trim(), row.code, 'code text at step ' + row.step);
    assert.equal((await page.getByTestId('lab-source-line').innerText()).replace(/^\d+/, '').trim(), row.code);
    assert.equal(await page.getByTestId('motion-svg').getAttribute('data-step'), 'step-' + row.step);
    for (const name of row.changed ? row.changed.split(',') : []) assert.equal(await page.locator(`[data-testid=lab-vars] tr[data-changed=true] th`).filter({hasText: new RegExp('^' + name + '$')}).count(), 1, name + ' marked changed at ' + row.step);
  }
  const lastVars = JSON.parse(trace.at(-1).vars);
  assert.equal(await page.getByTestId('kpi-mean').innerText(), String(lastVars.mean));
  assert.equal(await page.getByTestId('kpi-processed').innerText(), `${lastVars.results.length} / ${lastVars.rows.length}`);

  // 3. Focus a line: jumps to the next recorded step at that line.
  await scrub(page, 0);
  const appendLine = trace.find(r => r.code.startsWith('results.append')).line;
  await page.locator(`[data-testid=lab-code] li[data-line="${appendLine}"] button`).click(); await settled(page);
  const firstAppend = trace.find(r => r.line === appendLine).step;
  assert.equal(await step(page), firstAppend);
  await page.locator(`[data-testid=lab-code] li[data-line="${appendLine}"] button`).click(); await settled(page);
  assert.equal(await step(page), trace.filter(r => r.line === appendLine)[1].step);

  // 4. Transcript is complete and seeks.
  const items = page.locator('[data-testid=lab-transcript] li');
  assert.equal(await items.count(), trace.length);
  for (const row of trace) assert.match(await items.nth(row.step).innerText(), new RegExp('^L' + row.line + '\\b'));
  await items.nth(13).locator('button').click(); await settled(page); assert.equal(await step(page), 13);

  // 5. Deterministic snapshots: step 13 reached forward and backward is the same SVG and the same pixels.
  const visual = page.locator('.lab-visual');
  const svgA = await page.getByTestId('motion-svg').evaluate(n => n.outerHTML), pngA = await visual.screenshot({animations: 'disabled'});
  await scrub(page, trace.length - 1); await scrub(page, 13);
  const svgB = await page.getByTestId('motion-svg').evaluate(n => n.outerHTML), pngB = await visual.screenshot({animations: 'disabled'});
  assert.equal(svgA, svgB, 'SVG differs for the same step'); assert.equal(sha(pngA), sha(pngB), 'pixels differ for the same step');
  await page.screenshot({path: path.join(stills, 'lab-step-13.png')});

  // 6. Play at 2x advances by itself; pause stops it; ISO keeps identities.
  await scrub(page, 5); await page.getByTestId('lab-speed').selectOption('2');
  await page.getByTestId('lab-play').click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid=coding-lab]').dataset.step) >= 7, {}, {timeout: 8000});
  await page.getByTestId('lab-play').click(); await settled(page);
  const paused = await step(page); await page.waitForTimeout(1200); assert.equal(await step(page), paused, 'pause must stop progression');
  await page.getByRole('button', {name: 'ISO', exact: true}).click(); await settled(page);
  assert.equal(await page.getByTestId('motion-svg').getAttribute('data-projection'), 'isometric');
  await scrub(page, 27); await page.screenshot({path: path.join(stills, 'lab-iso-step-27.png')});
  await page.getByRole('button', {name: '2D', exact: true}).click(); await scrub(page, 25);
  await page.screenshot({path: path.join(stills, 'lab-step-25.png'), fullPage: true});

  // 7. Lineage link opens the declared chain of the trace artifact.
  await page.getByTestId('lab-lineage').click();
  await page.getByTestId('lineage').waitFor({timeout: 30000});
  assert.ok(await page.getByTestId('lineage-node').count() >= 6, 'lineage nodes');
  await page.screenshot({path: path.join(stills, 'lineage.png')});
  assert.deepEqual(errors, [], 'console errors');
  await context.close();

  // 8. Reduced motion (system preference): no autoplay, steps settle immediately, manual controls work.
  const calm = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  const quiet = await calm.newPage(), quietErrors = watch(quiet);
  await quiet.goto(base); await quiet.getByTestId('coding-lab').waitFor({timeout: 30000});
  assert.equal(await quiet.getByTestId('coding-lab').getAttribute('data-reduced'), 'true');
  assert.equal(await quiet.getByTestId('lab-play').isDisabled(), true);
  assert.ok(await quiet.getByTestId('lab-reduced-note').isVisible());
  await quiet.getByTestId('lab-next').click();
  assert.equal(await quiet.getByTestId('motion-svg').getAttribute('data-animating'), 'false');
  assert.equal(await quiet.getByTestId('coding-lab').getAttribute('data-step'), '1');
  assert.deepEqual(quietErrors, [], 'console errors (reduced)'); await calm.close();

  // 9. The in-page reduced-motion toggle has the same effect.
  const toggle = await browser.newContext({viewport: {width: 1280, height: 900}});
  const tp = await toggle.newPage(); await tp.goto(base); await tp.getByTestId('coding-lab').waitFor({timeout: 30000});
  await tp.getByTestId('lab-reduced').check(); assert.equal(await tp.getByTestId('lab-play').isDisabled(), true);
  await toggle.close();

  // 10. 390 px: panes stack, no horizontal page scroll, controls still reachable.
  const phoneContext = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
  const phone = await phoneContext.newPage(), phoneErrors = watch(phone);
  await phone.goto(base); await phone.getByTestId('coding-lab').waitFor({timeout: 30000});
  await scrub(phone, 9);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'horizontal page scroll at 390 px: ' + overflow);
  assert.ok(await phone.getByTestId('lab-next').isVisible());
  await phone.screenshot({path: path.join(stills, 'lab-390.png'), fullPage: true});
  assert.deepEqual(phoneErrors, [], 'console errors at 390 px'); await phoneContext.close();
} finally {await browser.close(); server.close();}

// 11. Framework capture of the same saved state twice: identical screenshot hashes.
const {captureBuiltClient} = await import('./capture-client.mjs');
const {writeFile} = await import('node:fs/promises');
const tmp = path.join((await import('node:os')).tmpdir(), 'coding-lab-capture');
await rm(tmp, {recursive: true, force: true}); await mkdir(tmp, {recursive: true});
const {loadClient} = await import('./load-client.mjs'), {SiteRuntime} = await import('../src/framework/runtime.ts');
const runtime = new SiteRuntime(await loadClient(ID)); runtime.set('lab-step', 19);
await writeFile(path.join(tmp, 'state.json'), JSON.stringify(runtime.save('lab'), null, 2));
const shots = [];
for (const run of ['a', 'b']) shots.push((await captureBuiltClient({id: ID, width: 1440, height: 1000, port: 4187, out: path.join(tmp, run), state: path.join(tmp, 'state.json')})).screenshot.sha256);
assert.equal(shots[0], shots[1], 'two captures of the same state differ');
console.log(`Coding lab smoke OK: ${trace.length} steps line-matched, focus line, transcript, deterministic snapshots, play/pause, reduced motion, 390 px, lineage, JS ${gzip} B <= ${BUDGET} B, captures stable (${shots[0].slice(0, 12)})`);
