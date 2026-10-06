import {test, expect, type Page} from '@playwright/test';
import {publicationHead, validatePublication} from '../../scripts/publication.mjs';
/** Controlled published-head fixture over actual production HTTP modules, not a mocked renderer. */
async function publishedHead(page: Page, title = 'Approved public title', description = 'Approved publication description') {
  const head = publicationHead(validatePublication({format: 'datapass.publication', version: 1, visibility: 'public', language: 'en', canonicalUrl: 'https://example.test/approved/', title, description}, {title: 'Fallback', description: 'Fallback'}));
  await page.route('http://127.0.0.1:4173/?app=operations-reference*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '').replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi, '').replace('<head>', '<head>' + head);
    await route.fulfill({response, body});
  });
  await page.goto('/?app=operations-reference'); await expect(page.locator('.studio-site[data-app-id="operations-reference"]')).toBeVisible();
}
let errors: string[] = [];
test.beforeEach(async({page}) => {errors = []; page.on('pageerror', e => errors.push(e.message));});
test.afterEach(() => {expect(errors).toEqual([]);});
test('published title base and approved description survive hydration and navigation', async({page}) => {
  await publishedHead(page); await expect(page).toHaveTitle('Overview | Approved public title');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', 'Approved publication description');
  await page.getByRole('navigation', {name: 'Site pages'}).getByRole('button', {name: 'Data contract', exact: true}).click();
  await expect(page).toHaveTitle('Data contract | Approved public title');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', 'Approved publication description');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://example.test/approved/');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'index,follow');
});
test('publication metadata remains text rather than executable markup after hydration', async({page}) => {
  const title = 'Approved <b id="metadata-injection">title</b>', description = 'A <script id="metadata-script">bad()</script> literal';
  await publishedHead(page, title, description); await expect(page).toHaveTitle('Overview | ' + title);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', description);
  await expect(page.locator('#metadata-injection, #metadata-script')).toHaveCount(0);
});
test('integrated mode without a published head retains ordinary client metadata', async({page}) => {
  await page.goto('/?app=operations-reference'); await expect(page).toHaveTitle('Overview | Operations / reference app');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', 'A small business data app built with the same registry as the 3D wind example.');
});
