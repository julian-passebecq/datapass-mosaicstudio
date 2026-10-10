import {test, expect, type Page} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {createServer, type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {clientCspFor} from '../../scripts/client-csp.mjs';
// FR-05: the animated coding explanation and the architecture walkthrough (shared selection, source evidence, reset);
// light content/motion outputs load no database, kernel, WebGL or T3 (request capture plus a WebGL context spy).
// FR-06: the draft Fabric Bricks route still works.
// Reference clients run on the workbench preview (baseURL). Non-reference clients are not in the default production
// workbench (AGENTS.md rule 17), so they are built as selected clients and served with their production CSP.
let errors: string[] = [], requests: string[] = [], origin = '';
const HEAVY = /\.wasm(?:\?|$)|\/duckdb\/|duckdb-|three(?:\.module)?[-.]|SceneViewport-|Scene3D-|ModelBlock-|GLTFLoader|engine-[^/]*\.js$|\/t3code|[?&/]t3[=/]/i;
test.beforeEach(async({page}, info) => {
  errors = []; requests = []; origin = new URL(info.project.use.baseURL || 'http://127.0.0.1:4173').origin + '/';
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request', r => requests.push(r.url()));
  // Record every WebGL context request: light outputs must not create one.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (window as unknown as {__webgl: string[]}).__webgl = [];
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) (window as unknown as {__webgl: string[]}).__webgl.push(type);
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
});
test.afterEach(async({}, info) => {
  await info.attach('explanations-requests', {body: JSON.stringify({errors, requests}, null, 2), contentType: 'application/json'});
  expect(errors).toEqual([]);
  expect(requests.filter(u => /^https?:/.test(u) && !u.startsWith(origin)), 'no external or kernel origin').toEqual([]);
});
const light = async(page: Page) => {
  expect(requests.filter(u => HEAVY.test(u)), 'no database, kernel, WebGL or T3 request').toEqual([]);
  expect(await page.evaluate(() => (window as unknown as {__webgl: string[]}).__webgl)).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(0);
};
const button = (page: Page, name: string) => page.getByRole('button', {name, exact: true});

/** Build one selected client (no deployment) and serve dist-clients/<id> on an ephemeral loopback port. */
function selectedClient(id: string) {
  let server: Server | undefined;
  const state = {base: ''};
  test.beforeAll(async() => {
    test.setTimeout(600000);
    const built = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/build-client.mjs', id], {encoding: 'utf8', timeout: 540000});
    expect(built.status, built.stdout + built.stderr).toBe(0);
    const root = path.resolve('dist-clients', id), csp = clientCspFor(path.resolve('clients', id));
    const types: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg'};
    server = createServer(async(req, res) => {
      const url = new URL(req.url || '/', 'http://x'), file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
      try {const body = await readFile(file); res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp}); res.end(body);}
      catch {res.writeHead(404).end();}
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    state.base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
  });
  test.beforeEach(() => {origin = state.base;});
  test.afterAll(async() => {await new Promise(resolve => server ? server.close(resolve) : resolve(undefined));});
  return state;
}

test.describe('coding explanation (selected client build)', () => {
  const client = selectedClient('animated-coding-lab');
  test('one selection across visual, code, explanation and transcript; reset returns to the start', async({page}) => {
    await page.goto(client.base + '?app=animated-coding-lab');
    const lab = page.getByTestId('coding-lab');
    await expect(lab).toHaveAttribute('data-capture-state', 'ready');
    await expect(lab).toHaveAttribute('data-selection', 'none');
    // Select the second input row from the visual's row picker.
    await page.getByTestId('lab-pick-row-1').click();
    await expect(lab).toHaveAttribute('data-selection', 'row-1');
    await expect(page.getByTestId('lab-selected')).toContainText('row-1');
    await expect(page.getByTestId('lab-related-count')).toContainText('6 related steps');
    await expect(page.getByTestId('motion-svg')).toHaveAttribute('data-selection', 'row-1');
    await expect(page.locator('[data-testid=lab-transcript] li[data-related]')).toHaveCount(6);
    // The code pane marks the six lines this row ran: for, def, return, call site, append, total.
    await expect(page.locator('[data-testid=lab-code] li[data-highlight=true]')).toHaveCount(6);
    // Jump from the selection to its call step; the step changes, the selection stays.
    await page.getByRole('group', {name: 'Steps related to the selection'}).getByRole('button', {name: '13', exact: true}).click();
    await expect(lab).toHaveAttribute('data-step', '12');
    await expect(lab).toHaveAttribute('data-event', 'call');
    await expect(lab).toHaveAttribute('data-selection', 'row-1');
    // Selecting a box in the SVG writes the same field; the projection change keeps it.
    await page.getByTestId('motion-svg').locator('[data-entity=kpi]').click();
    await expect(lab).toHaveAttribute('data-selection', 'kpi');
    await button(page, 'ISO').click();
    await expect(page.getByTestId('motion-svg')).toHaveAttribute('data-projection', 'isometric');
    await expect(page.getByTestId('motion-svg')).toHaveAttribute('data-selection', 'kpi');
    await page.getByTestId('lab-reset').click();
    await expect(lab).toHaveAttribute('data-step', '0');
    await expect(lab).toHaveAttribute('data-selection', 'none');
    await expect(lab).toHaveAttribute('data-playing', 'false');
    await expect(page.getByTestId('motion-svg')).toHaveAttribute('data-projection', 'diagram');
    await expect(page.getByTestId('lab-provenance')).toContainText('normalize_rows.py');
    await light(page);
  });
});

test.describe('draft Fabric Bricks route (selected client build)', () => {
  const client = selectedClient('fabric-bricks');
  test('the legacy gallery still opens, synthetic and without 3D until chosen', async({page}) => {
    await page.goto(client.base + '?app=fabric-bricks');
    await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-screen', 'gallery');
    await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-source-status', 'synthetic/provisional');
    await expect(button(page, 'Open Lakehouse')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(requests.filter(u => /KitModel|SceneViewport|three(?:\.module)?[-.]/.test(u))).toEqual([]);
  });
});

test('architecture walkthrough: source excerpts, shared selection with the review canvas, reset', async({page}) => {
  await page.goto('/?app=architecture-reference&page=walkthrough');
  const motion = page.getByTestId('motion');
  await expect(motion).toBeVisible();
  await expect(page.locator('.arch-node')).toHaveCount(8);
  await expect(motion).toHaveAttribute('data-selection', 'none');
  // Go to the aggregation step: the walkthrough focus becomes the shared selection of the review canvas.
  await page.getByLabel('Motion step', {exact: true}).selectOption({index: 5});
  await expect(motion).toHaveAttribute('data-step-id', 'aggregate');
  await expect(motion).toHaveAttribute('data-selection', 'site_performance');
  await expect(page.locator('.site-architecture')).toHaveAttribute('data-selection', 'site_performance');
  await expect(page.locator('.arch-outline').getByRole('button', {name: 'Select Site performance', exact: true})).toHaveAttribute('aria-pressed', 'true');
  // Source evidence: the inspector opens the literal synthetic excerpt.
  await page.locator('.motion-reference').filter({hasText: 'models/site_performance.sql'}).first().click();
  await expect(motion).toHaveAttribute('data-panel', 'source');
  await expect(page.locator('.site-motion')).toContainText('models/site_performance.sql');
  await expect(page.locator('.site-motion')).toContainText('GROUP BY site_id');
  // Selecting in the review canvas outline selects the same identity in the walkthrough.
  await page.locator('.arch-outline').getByRole('button', {name: 'Select Turbine telemetry', exact: true}).click();
  await expect(motion).toHaveAttribute('data-selection', 'telemetry');
  await page.getByRole('tab', {name: 'Scene', exact: true}).click();
  await expect(page.getByTestId('motion-svg')).toHaveAttribute('data-selection', 'telemetry');
  await page.getByTestId('motion-reset').click();
  await expect(motion).toHaveAttribute('data-step-index', '0');
  await expect(motion).toHaveAttribute('data-selection', 'none');
  await expect(motion).toHaveAttribute('data-panel', 'scene');
  await expect(page.locator('.site-architecture')).toHaveAttribute('data-selection', 'none');
  expect(requests.filter(u => /\.wasm(?:\?|$)|\/duckdb\/|three(?:\.module)?[-.]|\/t3code/i.test(u))).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as {__webgl: string[]}).__webgl)).toEqual([]);
});

test('light motion output: the motion reference loads no database, kernel, WebGL or T3 and resets', async({page}) => {
  await page.goto('/?app=motion-reference&page=choreography');
  await expect(page.getByTestId('motion')).toBeVisible();
  await button(page, 'Next motion step').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '1');
  await page.getByTestId('motion-reset').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '0');
  await light(page);
});
