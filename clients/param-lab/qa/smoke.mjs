/** Browser smoke for the param-lab prototype (not part of the CI suite).
 * Starts the selected-client dev server, then: wait for a ready mesh hash,
 * change a slider -> hash changes, click a face and an edge -> selection details.
 * Usage: node clients/param-lab/qa/smoke.mjs [--port 5297 | --url http://127.0.0.1:5297/?app=param-lab] [--out dir]
 */
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = path.resolve(arg('--out') || '.generated/param-lab-smoke');
await mkdir(out, {recursive: true});
let url = arg('--url'), server = null;
if (!url) {
  server = spawn(process.execPath, ['--experimental-strip-types', 'scripts/client-dev.mjs', 'param-lab', '--port', arg('--port') || '5297', '--json'], {stdio: ['ignore', 'pipe', 'inherit']});
  url = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('dev server not ready in 120 s')), 120000);
    server.stdout.on('data', chunk => {
      buf += chunk; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const rec = JSON.parse(line); if (rec.status === 'ready') { clearTimeout(timer); resolve(rec.url); } if (rec.status === 'error' || rec.status === 'invalid') reject(new Error(rec.message)); } catch {}
      }
    });
    server.on('exit', code => reject(new Error('dev server exited ' + code)));
  });
}
const fail = msg => { throw new Error('SMOKE FAIL: ' + msg); };
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 180000});
  const lab = page.locator('[data-param-lab]');
  const readyHash = async previous => {
    await page.waitForFunction(prev => { const el = document.querySelector('[data-param-lab]'); return el?.getAttribute('data-capture-state') === 'ready' && el.getAttribute('data-mesh-hash') && el.getAttribute('data-mesh-hash') !== prev; }, previous ?? '', {timeout: 180000});
    return lab.getAttribute('data-mesh-hash');
  };
  const h1 = await readyHash();
  const kernel = await lab.getAttribute('data-kernel');
  console.log('initial hash', h1, 'kernel', kernel);
  await page.screenshot({path: path.join(out, '1-initial.png')});

  // Slider -> worker rebuild -> new hash.
  const twist = page.locator('[data-param="p-twist"] input[type=range]');
  await twist.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  const h2 = await readyHash(h1);
  if (h2 === h1) fail('hash did not change after the slider');
  console.log('after twist +2', h2);
  // Same params again -> same hash (determinism in the browser).
  await twist.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  const h3 = await readyHash(h2);
  if (h3 !== h1) fail(`restoring params gave ${h3}, expected ${h1}`);
  console.log('restored params -> same hash', h3);

  // Click picking: scan the viewport with hover until a face, then an edge, is under the cursor.
  const box = await page.locator('.pl-viewport').boundingBox();
  const find = async predicate => {
    for (let y = 0.2; y <= 0.8; y += 0.03) for (let x = 0.15; x <= 0.85; x += 0.02) {
      const px = box.x + box.width * x, py = box.y + box.height * y;
      await page.mouse.move(px, py);
      const hover = await page.locator('.pl-viewport').getAttribute('data-hover');
      if (hover && predicate(hover)) return {px, py, hover};
    }
    return null;
  };
  const face = await find(id => id.endsWith('surface') || id.startsWith('hub.'));
  if (!face) fail('no face under any scanned point');
  await page.mouse.click(face.px, face.py);
  await page.waitForFunction(id => document.querySelector('[data-param-lab]')?.getAttribute('data-selected-feature') === id, face.hover);
  const json = JSON.parse(await page.locator('[data-testid=selection-json]').inputValue());
  if (json.feature.id !== face.hover || !json.feature.hitPoint || json.geometry.meshHash !== h1) fail('selection JSON mismatch ' + JSON.stringify(json.feature));
  if (await lab.getAttribute('data-mesh-hash') !== h1) fail('selection triggered a rebuild');
  console.log('clicked face', face.hover, 'driving params', json.drivingParams.length);
  await page.screenshot({path: path.join(out, '2-face-selected.png')});

  const edge = await find(id => id.endsWith('-edge'));
  if (!edge) fail('no edge under any scanned point');
  await page.mouse.click(edge.px, edge.py);
  await page.waitForFunction(id => document.querySelector('[data-param-lab]')?.getAttribute('data-selected-feature') === id, edge.hover);
  if ((await page.locator('[data-testid=feature-id]').textContent()) !== edge.hover) fail('feature id panel mismatch');
  console.log('clicked edge', edge.hover);
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.locator('[data-testid=selection-json]').scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(out, '3-edge-selected.png')});

  // Narrow viewport: no horizontal overflow, still ready.
  await page.setViewportSize({width: 390, height: 900});
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('horizontal overflow at 390px: ' + overflow);
  await page.screenshot({path: path.join(out, '4-mobile.png'), fullPage: false});
  const real = errors.filter(e => !/favicon|DevTools/.test(e));
  if (real.length) fail('console errors: ' + real.join(' | '));
  console.log('SMOKE OK; screenshots in', out);
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
