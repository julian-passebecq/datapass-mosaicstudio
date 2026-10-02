import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const start = async(page: Page, pageId = 'flow') => {await page.goto('/?app=motion-reference&page=' + pageId); await expect(page.getByTestId('motion')).toBeVisible();};
const button = (page: Page, name: string) => page.getByRole('button', {name, exact: true});
const svg = (page: Page) => page.getByTestId('motion-svg');
const token = (page: Page) => svg(page).locator('[data-entity=batch]');
let errors: string[] = [], external: string[] = [], heavy: string[] = [];
test.beforeEach(async({page}) => {
  errors = []; external = []; heavy = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request', r => {if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url()); if (/\.wasm|\/duckdb\/|SceneViewport-|Scene3D-/.test(r.url())) heavy.push(r.url());});
});
test.afterEach(async({}, info) => {
  await info.attach('motion-diagnostics', {body: JSON.stringify({errors, external, heavy}, null, 2), contentType: 'application/json'});
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(heavy).toEqual([]);
});
test('two projections retain DOM identity, exact snapshot and no WebGL', async({page}, info) => {
  await start(page); await expect(svg(page)).toHaveAttribute('data-projection', 'diagram'); await expect(svg(page).locator('.motion-object')).toHaveCount(6);
  await expect(page.locator('canvas,iframe,textarea,.monaco-editor')).toHaveCount(0);
  await token(page).evaluate(el => Reflect.set(window, '__motionToken', el));
  const before = await token(page).getAttribute('data-world');
  await button(page, 'Use isometric projection').click(); await expect(svg(page)).toHaveAttribute('data-projection', 'isometric');
  expect(await token(page).evaluate(el => Reflect.get(window, '__motionToken') === el)).toBe(true);
  await expect(token(page)).toHaveAttribute('data-world', before!);
  await expect(svg(page).locator('[data-entity=capture] polygon')).toHaveCount(3);
  await page.screenshot({path: info.outputPath('motion-isometric-overview.png'), fullPage: true});
});
test('forward step uses a finite D3 transfer and selection does not cancel it', async({page}, info) => {
  await start(page); await button(page, 'Next motion step').click();
  await expect(svg(page)).toHaveAttribute('data-animating', 'true');
  await button(page, 'Inspect Model').click();
  await expect(svg(page)).toHaveAttribute('data-animating', 'false');
  await expect(token(page)).toHaveAttribute('data-world', '4.0000,0.0000,0.6800');
  await expect(page.getByTestId('motion')).toHaveAttribute('data-selection', 'model');
  await expect(page.getByRole('complementary', {name: 'Motion context'})).toContainText('Inspect the aggregation');
  await button(page, 'Use isometric projection').click();
  await page.screenshot({path: info.outputPath('motion-isometric-transfer.png'), fullPage: true});
});
test('seek and reverse restore canonical state without replaying skipped transfers', async({page}) => {
  await start(page); await page.getByLabel('Motion step', {exact: true}).selectOption('4');
  await expect(token(page)).toHaveAttribute('data-world', '8.0000,0.0000,0.6800'); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
  await page.getByLabel('Motion step', {exact: true}).selectOption('0'); await expect(token(page)).toHaveAttribute('data-world', '0.0000,0.0000,0.6800');
  await button(page, 'Next motion step').click(); await button(page, 'Next motion step').click(); await button(page, 'Previous motion step').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '1'); await expect(token(page)).toHaveAttribute('data-world', '4.0000,0.0000,0.6800');
});
test('source links open exact read-only excerpts with validated line highlights', async({page}, info) => {
  await start(page); await button(page, 'Inspect Validation').click(); await button(page, 'Inspect the quality rule examples/validate.py:2-4').click();
  await expect(page.getByRole('tab', {name: 'Sources', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Source file')).toHaveValue('validation');
  await expect(page.locator('.source-lines [data-highlight=true]')).toHaveCount(3);
  await expect(page.locator('.source-lines')).toContainText('def validate_rows');
  await expect(page.locator('textarea,input[contenteditable],iframe')).toHaveCount(0);
  await page.screenshot({path: info.outputPath('motion-source-context.png'), fullPage: true});
  const waiting = page.waitForEvent('download'); await button(page, 'Download source text').click(); const download = await waiting;
  expect(download.suggestedFilename()).toBe('validate.py'); expect(await readFile((await download.path())!, 'utf8')).toContain('def validate_rows');
});
test('workspace tabs support arrow navigation and independent panel toggles', async({page}) => {
  await start(page); const tabs = page.getByRole('tablist'); await tabs.getByRole('tab', {name: 'Scene', exact: true}).focus();
  await page.keyboard.press('ArrowRight'); await expect(tabs.getByRole('tab', {name: 'Sources', exact: true})).toBeFocused();
  await page.keyboard.press('End'); await expect(tabs.getByRole('tab', {name: 'Steps', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.motion-transcript li')).toHaveCount(5);
  await button(page, 'Hide objects').click(); await expect(page.getByRole('complementary', {name: 'Motion objects'})).toHaveCount(0);
  await button(page, 'Hide context').click(); await expect(page.getByRole('complementary', {name: 'Motion context'})).toHaveCount(0);
  await button(page, 'Show context').click(); await expect(page.getByRole('complementary', {name: 'Motion context'})).toBeVisible();
  await button(page, 'Apply the quality rule').click(); await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '1'); await expect(token(page)).toHaveAttribute('data-world', '4.0000,0.0000,0.6800');
});
test('SVG and script-free reports exclude source until explicitly requested', async({page}, info) => {
  await start(page); await page.getByLabel('Motion step', {exact: true}).selectOption('2');
  let pending = page.waitForEvent('download'); await button(page, 'Export SVG snapshot').click(); const vector = await readFile((await(await pending).path())!, 'utf8');
  expect(vector).toContain('SYNTHETIC'); expect(vector).not.toContain('def validate_rows'); expect(vector).not.toContain('<script');
  pending = page.waitForEvent('download'); await button(page, 'Export review HTML').click(); const report = await readFile((await(await pending).path())!, 'utf8');
  expect(report).not.toContain('<script'); expect(report).not.toContain('def validate_rows'); expect(report).toContain("default-src 'none'");
  const preview = await page.context().newPage(); await preview.setContent(report); await expect(preview.getByRole('heading', {level: 1})).toHaveText('A record becomes an analytical result');
  await preview.screenshot({path: info.outputPath('motion-static-report.png'), fullPage: true}); await preview.close();
  await page.getByLabel('Include referenced source text in HTML').check(); pending = page.waitForEvent('download'); await button(page, 'Export review HTML').click();
  const withCode = await readFile((await(await pending).path())!, 'utf8'); expect(withCode).toContain('def validate_rows'); expect(withCode).toContain('included by explicit choice');
});
test('reviewed restore preserves the source tab and manual selection, not autoplay', async({page}) => {
  await start(page); await page.getByLabel('Motion step', {exact: true}).selectOption('2'); await button(page, 'Inspect Validation').click();
  await button(page, 'Inspect the quality rule examples/validate.py:2-4').click();
  await page.locator('.site-session summary').click(); const pending = page.waitForEvent('download'); await button(page, 'Export inputs').click();
  const saved = JSON.parse(await readFile((await(await pending).path())!, 'utf8')); expect(saved.values['flow-step']).toBe(2); expect(saved.values['flow-selection']).toBe('quality');
  expect(JSON.stringify(saved)).not.toContain('def validate_rows'); await button(page, 'Reset inputs').click();
  await page.getByLabel('Restore saved site inputs').setInputFiles({name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved))}); await button(page, 'Apply saved inputs').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '2'); await expect(page.getByLabel('Source file')).toHaveValue('validation');
  saved.values['flow-step'] = 1000; await page.getByLabel('Restore saved site inputs').setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved))});
  await expect(page.getByRole('alert')).toContainText('invalid number'); await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '2');
});
test('narration autoplay stops on inspection, page departure and reduced motion', async({page}) => {
  await start(page); await button(page, 'Play motion').click();
  await expect(page.getByTestId('motion')).toHaveAttribute('data-step-index', '1', {timeout: 6000});
  await button(page, 'Inspect Capture').click(); await expect(button(page, 'Play motion')).toBeVisible();
  await button(page, 'Play motion').click(); await page.getByRole('navigation', {name: 'Site pages'}).getByRole('button', {name: 'On-demand dependency', exact: true}).click();
  await page.getByRole('navigation', {name: 'Site pages'}).getByRole('button', {name: 'Data journey', exact: true}).click(); await expect(button(page, 'Play motion')).toBeVisible();
  await page.emulateMedia({reducedMotion: 'reduce'}); await expect(button(page, 'Play motion')).toBeDisabled(); await button(page, 'Next motion step').click(); await expect(svg(page)).toHaveAttribute('data-animating', 'false');
});
test('the second explanation uses the same renderer and follows its authored polyline', async({page}, info) => {
  await start(page, 'modules'); await button(page, 'Use isometric projection').click();
  await page.getByLabel('Motion step', {exact: true}).selectOption('2'); await button(page, 'Next motion step').click();
  await expect(svg(page)).toHaveAttribute('data-animating', 'false'); await expect(svg(page).locator('[data-entity=package]')).toHaveAttribute('data-world', '8.0000,3.0000,0.7800');
  await page.screenshot({path: info.outputPath('motion-module-metaphor.png'), fullPage: true});
});
test('mobile keeps navigation and evidence usable without expanding the page width', async({page}, info) => {
  await page.setViewportSize({width: 390, height: 844}); await start(page); await button(page, 'Use isometric projection').click();
  await button(page, 'Show objects').click(); await button(page, 'Inspect Validation').click(); await button(page, 'Inspect the quality rule examples/validate.py:2-4').click();
  await expect(page.locator('.source-lines')).toContainText('def validate_rows');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({path: info.outputPath('motion-mobile-evidence.png'), fullPage: true});
});
