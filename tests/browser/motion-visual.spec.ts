import {test, expect} from '@playwright/test';

let errors: string[] = [];
test.beforeEach(async({page}) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
});
test.afterEach(async() => {expect(errors).toEqual([]);});

test('actual D3 transfer visits intermediate positions and settles exactly', async({page}) => {
  await page.goto('/?app=motion-reference&page=flow');
  const svg = page.getByTestId('motion-svg'), token = svg.locator('[data-entity=batch]');
  await expect(token).toHaveAttribute('data-world', '0.0000,0.0000,0.6800');
  await token.evaluate(element => {
    const samples: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) if (record.attributeName === 'data-world') samples.push(element.getAttribute('data-world') || '');
    });
    observer.observe(element, {attributes: true, attributeFilter: ['data-world']});
    Reflect.set(window, '__motionSampleProof', {samples, observer, element});
  });
  await page.getByRole('button', {name: 'Next motion step', exact: true}).click();
  await expect(token).toHaveAttribute('data-world', '4.0000,0.0000,0.6800');
  await expect(svg).toHaveAttribute('data-animating', 'false');
  const observed = await token.evaluate(element => {
    const proof = Reflect.get(window, '__motionSampleProof') as {samples: string[]; observer: MutationObserver; element: Element};
    proof.observer.disconnect();
    const result = {sameObject: proof.element === element, samples: proof.samples};
    Reflect.deleteProperty(window, '__motionSampleProof');
    return result;
  });
  expect(observed.sameObject).toBe(true);
  const positions = observed.samples.map(sample => sample.split(',').map(Number));
  expect(positions.some(([x]) => x > 0 && x < 4)).toBe(true);
  expect(positions.every(([x, y, z]) => x >= 0 && x <= 4 && y === 0 && z === .68)).toBe(true);
});

test('mobile workspace uses a short horizontal rail and a full-width readable inspector', async({page}, info) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/?app=motion-reference&page=flow');
  await expect(page.getByTestId('motion')).toBeVisible();
  await page.getByRole('button', {name: 'Use isometric projection', exact: true}).click();
  await page.getByRole('button', {name: 'Show objects', exact: true}).click();
  const rail = await page.locator('.workspace-rail').boundingBox();
  expect(rail!.height).toBeLessThan(65);
  expect(rail!.width).toBeGreaterThan(330);
  await page.getByRole('button', {name: 'Inspect Validation', exact: true}).click();
  await page.getByRole('button', {name: 'Inspect the quality rule examples/validate.py:2-4', exact: true}).click();
  const source = await page.locator('.source-reader').boundingBox();
  const inspector = await page.getByRole('complementary', {name: 'Motion context'}).boundingBox();
  expect(source!.width).toBeGreaterThan(330);
  expect(inspector!.width).toBeGreaterThan(330);
  expect(Math.abs(source!.x - inspector!.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('.source-lines [data-highlight=true]')).toHaveCount(3);
  await page.screenshot({path: info.outputPath('motion-mobile-refined.png'), fullPage: true});
});
