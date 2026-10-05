import {test,expect,type Page} from '@playwright/test';

const open=async(page:Page,query='')=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?app=arch-atlas'+query,{timeout:180000});
  await expect(page.getByTestId('arch-atlas')).toBeVisible({timeout:180000});
  return errors;
};

test('3D atlas: layers by keyboard, domains, node focus and properties',async({page})=>{
  const errors=await open(page);
  await expect(page.locator('canvas[data-renderer=arch-atlas-webgl2]')).toBeVisible({timeout:180000});
  const atlas=page.getByTestId('arch-atlas');
  await expect(atlas).toHaveAttribute('data-layer','-1');
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
  await expect(atlas).toHaveAttribute('data-layer','1');
  await page.keyboard.press('ArrowRight');
  await expect(atlas).toHaveAttribute('data-group','0');
  await page.locator('.aa-label[data-node=sales-model]').click();
  await expect(atlas).toHaveAttribute('data-selection','sales-model');
  const details=page.getByTestId('atlas-details');
  await expect(details).toContainText('Semantic model');
  await expect(details).toContainText('Sales warehouse');
  await details.getByRole('button',{name:/Revenue report/}).click();
  await expect(atlas).toHaveAttribute('data-selection','sales-report');
  await page.keyboard.press('Escape');
  await expect(atlas).toHaveAttribute('data-selection','none');
  expect(errors).toEqual([]);
});

test('static 2D: same ids in layered and isometric SVG, click selects, export downloads',async({page})=>{
  const errors=await open(page);
  await page.getByRole('button',{name:'Layered 2D'}).click();
  const flat=page.getByTestId('atlas-layered');
  await expect(flat.locator('[data-node]')).toHaveCount(18);
  await flat.locator('[data-node=clean-notebook]').click();
  await expect(page.getByTestId('arch-atlas')).toHaveAttribute('data-selection','clean-notebook');
  await page.getByRole('button',{name:'Isometric 2D'}).click();
  const iso=page.getByTestId('atlas-isometric');
  await expect(iso.locator('svg[data-renderer=framework-motion-v2]')).toBeVisible();
  await expect(iso.locator('[data-entity=clean-notebook]')).toHaveCount(1);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:/Layered SVG/}).click();
  expect((await download).suggestedFilename()).toBe('fabric-platform.layered.svg');
  await page.getByRole('button',{name:/DataPass MosaicStudio stack/}).click();
  await expect(page.getByTestId('arch-atlas')).toHaveAttribute('data-spec','datapass-stack');
  await expect(page.getByTestId('arch-atlas')).toHaveAttribute('data-selection','none');
  expect(errors).toEqual([]);
});

test('film: seek renders an exact frame and ends on the layered diagram',async({page})=>{
  const errors=await open(page,'&film=1&paused=1&chrome=0&t=0');
  await page.waitForFunction(()=>!!(window as unknown as {__archFilm?:unknown}).__archFilm,null,{timeout:180000});
  const shown=await page.evaluate(()=>(window as unknown as {__archFilm:{seek(t:number):Promise<number>}}).__archFilm.seek(21.5));
  expect(shown).toBe(21.5);
  await expect(page.getByTestId('atlas-film')).toHaveAttribute('data-film-t','21.5000');
  await expect(page.locator('.aa-film-panel [data-node=sales-model]')).toBeVisible();
  await page.evaluate(()=>(window as unknown as {__archFilm:{seek(t:number):Promise<number>}}).__archFilm.seek(27.5));
  await expect(page.locator('.aa-film-diagram svg[data-representation=layered]')).toBeVisible();
  expect(errors).toEqual([]);
});
