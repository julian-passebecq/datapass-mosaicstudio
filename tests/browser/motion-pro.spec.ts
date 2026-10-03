import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const open = async(page: Page) => {await page.goto('/?app=motion-reference&page=choreography'); await expect(page.getByTestId('motion')).toBeVisible();};
const svg = (page: Page) => page.getByTestId('motion-svg');
const button = (page: Page, name: string) => page.getByRole('button', {name, exact: true});
const seek = async(page: Page, index: number) => {await page.getByLabel('Motion step', {exact: true}).selectOption(String(index));};
let errors: string[] = [], network: string[] = [];
test.beforeEach(async({page}) => {
  errors = []; network = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request', r => {if (/^https?:/.test(r.url()) && (!r.url().startsWith('http://127.0.0.1:4173/') || /\.wasm|\/duckdb\/|SceneViewport-|ModelViewport-/.test(r.url()))) network.push(r.url());});
});
test.afterEach(async({}, info) => {await info.attach('choreography-diagnostics', {body: JSON.stringify({errors, network}), contentType: 'application/json'}); expect(errors).toEqual([]); expect(network).toEqual([]);});

test('v2 uses real staggered D3 updates and one stable DOM identity per object', async({page}, info) => {
  await open(page);
  await svg(page).evaluate(el => {
    const samples: number[][] = []; Reflect.set(window, '__choreoSamples', samples);
    const sample = () => {if (samples.length >= 400) return; samples.push(['record-a', 'record-b'].map(id => Number(el.querySelector(`[data-entity="${id}"]`)?.getAttribute('data-world')?.split(',')[0])));};
    const observer = new MutationObserver(sample); observer.observe(el, {subtree: true, attributes: true, attributeFilter: ['data-world']});
    Reflect.set(window, '__choreoObserver', observer); Reflect.set(window, '__recordA', el.querySelector('[data-entity="record-a"]'));
  });
  await button(page, 'Next motion step').click(); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
  const samples = await page.evaluate(() => {Reflect.get(window, '__choreoObserver').disconnect(); return Reflect.get(window, '__choreoSamples') as number[][];});
  expect(samples.some(([a, b]) => a > 0 && a < 6 && b === 0)).toBe(true);
  expect(samples.some(([a, b]) => a === 6 && b > 0 && b < 6)).toBe(true);
  expect(await svg(page).locator('[data-entity=record-a]').evaluate(el => el === Reflect.get(window, '__recordA'))).toBe(true);
  await expect(svg(page).locator('.motion-object')).toHaveCount(6);
  await expect(svg(page).locator('[data-entity=record-b]')).toHaveAttribute('data-world', '6.0000,3.0000,0.6800');
  await page.screenshot({path: info.outputPath('choreography-diagram.png'), fullPage: true});
});
test('semantic callouts preserve identity and evidence through projection changes', async({page}, info) => {
  await open(page); await seek(page, 1);
  await expect(svg(page).locator('[data-annotation]')).toHaveCount(2);
  const note = svg(page).locator('[data-annotation=second-lane]'); await note.evaluate(el => Reflect.set(window, '__note', el));
  const before = await note.locator('path').getAttribute('d');
  await button(page, 'Use isometric projection').click(); await expect(svg(page)).toHaveAttribute('data-projection', 'isometric');
  expect(await note.evaluate(el => el === Reflect.get(window, '__note'))).toBe(true); await expect(note).toHaveAttribute('data-anchor', 'record-b');
  expect(await note.locator('path').getAttribute('d')).not.toBe(before);
  await expect(page.locator('.motion-caption')).toContainText('Lane A settles before lane B begins.');
  await expect(page.locator('canvas,iframe')).toHaveCount(0);
  await page.screenshot({path: info.outputPath('choreography-isometric.png'), fullPage: true});
  await button(page, 'Read timing notes examples/choreography.txt:2-3').click();
  await expect(page.locator('.source-lines')).toContainText('illustrative_quality_rule');
  await expect(page.locator('.source-lines [data-highlight=true]')).toHaveCount(2);
});
test('reduced motion applied during a transfer immediately settles its canonical target', async({page}) => {
  await open(page); await button(page, 'Next motion step').click(); await expect(svg(page)).toHaveAttribute('data-animating', 'true');
  await page.emulateMedia({reducedMotion: 'reduce'}); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
  await expect(button(page, 'Play motion')).toBeDisabled(); await expect(svg(page).locator('[data-entity=record-b]')).toHaveAttribute('data-world', '6.0000,3.0000,0.6800');
  await seek(page, 0); await button(page, 'Next motion step').click(); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
});
test('a disappearing focused object does not leave keyboard focus in an aria-hidden subtree', async({page}) => {
  await open(page); await seek(page, 1); const object = svg(page).locator('[data-entity=record-a]'); await object.focus(); await expect(object).toBeFocused();
  await button(page, 'Next motion step').evaluate(el => (el as HTMLButtonElement).click());
  await expect(svg(page)).toHaveAttribute('data-animating', 'false'); await expect(object).toHaveAttribute('aria-hidden', 'true'); await expect(object).toHaveAttribute('tabindex', '-1');
  await expect(svg(page)).toBeFocused(); await button(page, 'Inspect Record A').click(); await expect(page.getByTestId('motion')).toHaveAttribute('data-selection', 'record-a');
  await expect(page.getByRole('complementary', {name: 'Motion context'})).toContainText('No');
});
test('transcript and static report retain annotation meaning without source disclosure', async({page}, info) => {
  await open(page); await seek(page, 1); await page.getByRole('tab', {name: 'Steps', exact: true}).click();
  await expect(page.locator('.motion-transcript li')).toHaveCount(4); await expect(page.locator('.motion-transcript')).toContainText('One shared player, not one timer per lane.');
  await expect(page.locator('.motion-transcript')).toContainText('A source excerpt is not proof of execution.');
  let download = page.waitForEvent('download'); await button(page, 'Export review HTML').click();
  const html = await readFile((await(await download).path())!, 'utf8'); expect(html).not.toContain('illustrative_quality_rule'); expect(html).not.toContain('<script'); expect(html).toContain('data-anchor="record-b"');
  const preview = await page.context().newPage(); await preview.setContent(html); await expect(preview.getByRole('heading', {level: 1})).toHaveText('Two lanes, one narrative clock');
  await preview.screenshot({path: info.outputPath('choreography-static-report.png'), fullPage: true}); await preview.close();
  await page.getByLabel('Include referenced source text in HTML').check(); download = page.waitForEvent('download'); await button(page, 'Export review HTML').click();
  expect(await readFile((await(await download).path())!, 'utf8')).toContain('illustrative_quality_rule');
});
test('rapid seek, reverse and projection changes never replay an obsolete target', async({page}) => {
  await open(page); await button(page, 'Next motion step').click(); await seek(page, 3); await button(page, 'Previous motion step').click(); await button(page, 'Use isometric projection').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-id', 'settled'); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
  await expect(svg(page).locator('[data-entity=record-b]')).toHaveAttribute('opacity', '0');
  await seek(page, 0); await expect(svg(page).locator('[data-entity=record-b]')).toHaveAttribute('data-world', '0.0000,3.0000,0.6800'); await expect(button(page, 'Play motion')).toBeVisible();
});
test('v2 saved state restores view identity but not animation or source payload', async({page}) => {
  await open(page); await seek(page, 1); await button(page, 'Use isometric projection').click(); await button(page, 'Inspect Record B').click();
  await page.locator('.site-session summary').click(); const download = page.waitForEvent('download'); await button(page, 'Export inputs').click();
  const saved = JSON.parse(await readFile((await(await download).path())!, 'utf8')); expect(saved.values['choreo-step']).toBe(1); expect(saved.values['choreo-selection']).toBe('record-b'); expect(JSON.stringify(saved)).not.toContain('illustrative_quality_rule');
  await button(page, 'Reset inputs').click(); await page.getByLabel('Restore saved site inputs').setInputFiles({name: 'choreo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved))}); await button(page, 'Apply saved inputs').click();
  await expect(svg(page)).toHaveAttribute('data-projection', 'isometric'); await expect(svg(page)).toHaveAttribute('data-selection', 'record-b'); await expect(svg(page)).toHaveAttribute('data-animating', 'false'); await expect(button(page, 'Play motion')).toBeVisible();
});
test('narrow-screen transcript is readable and does not widen the document', async({page}, info) => {
  await page.setViewportSize({width: 320, height: 740}); await open(page); await page.getByRole('tab', {name: 'Steps', exact: true}).click();
  await expect(page.locator('.motion-transcript')).toContainText('Lane A settles before lane B begins.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({path: info.outputPath('choreography-mobile-transcript.png'), fullPage: true});
});
