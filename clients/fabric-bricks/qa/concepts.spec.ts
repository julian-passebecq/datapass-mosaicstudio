import {test,expect} from '@playwright/test';
const out='clients/fabric-bricks/qa/captures';
test('documented concepts remain together while selection advances and decomposes one object',async({page})=>{
 const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?app=fabric-bricks');await expect(page.getByTestId('fabric-concepts')).toBeVisible();await expect(page.locator('canvas')).toHaveCount(0);
 expect(requests.filter(u=>/ConceptModel|SceneViewport|three(?:\.js|[_-])/.test(u))).toEqual([]);
 const plan=page.getByTestId('concept-plan');await expect(plan.locator('[role=button]')).toHaveCount(11);
 await plan.getByRole('button',{name:'Explorer Lakehouse',exact:true}).press('Enter');await expect(plan).toHaveAttribute('data-concept','concept-lakehouse');
 await expect(plan.locator('[role=button]')).toHaveCount(14);await expect(page.getByRole('link',{name:'Source : Microsoft Learn ↗',exact:true})).toHaveAttribute('href',/lakehouse-overview/);
 await plan.getByRole('button',{name:'Sélectionner Tables Delta',exact:true}).press('Space');await expect(page.getByTestId('concept-component')).toContainText('concept-lakehouse--tables');
 await page.getByRole('button',{name:'Plan 3D',exact:true}).click();const canvas=page.locator('canvas[data-renderer=three-webgl2]');await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute('data-animating','false');
 const model=page.getByTestId('concept-model');await expect(model).toHaveAttribute('data-selection','concept-lakehouse--tables');
 const positions=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(Object.keys(positions)).toHaveLength(44);expect(positions['concept-lakehouse']).toEqual([0,1,11]);expect(positions['concept-pipeline'][2]).toBeLessThan(0);
 expect(positions['concept-lakehouse--tables'][1]).toBeGreaterThan(3);
 await page.screenshot({path:out+'/fabric-concepts-foreground.png',fullPage:true});
 await page.getByRole('button',{name:'Réassembler',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');expect(JSON.parse((await canvas.getAttribute('data-part-positions'))!)['concept-lakehouse--tables'][1]).toBeLessThan(1);
 await page.getByRole('button',{name:'Décomposer',exact:true}).click();await page.getByRole('button',{name:'Vue d’ensemble',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');
 await expect(model).toHaveAttribute('data-selection','none');await page.screenshot({path:out+'/fabric-concepts-plan.png',fullPage:true});
 // Actual raycast in the overview advances a card and exposes its functional components.
 const rect=(await canvas.boundingBox())!;await page.mouse.click(rect.x+rect.width*.5,rect.y+rect.height*.5);
 await expect(model).not.toHaveAttribute('data-concept','none');await expect(model).toHaveAttribute('data-explode','1');
 await page.getByRole('button',{name:'Vue d’ensemble',exact:true}).click();await page.getByRole('button',{name:'Plan 2D',exact:true}).click();await expect(plan.locator('[role=button]')).toHaveCount(11);
 expect(errors).toEqual([]);
});
test('concept overview and foreground remain accessible in a narrow reduced-motion viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?app=fabric-bricks');
 await page.getByTestId('concept-plan').getByRole('button',{name:'Explorer Warehouse',exact:true}).press('Enter');
 await expect(page.getByTestId('fabric-concepts')).toHaveAttribute('data-reduced-motion','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Plan 3D',exact:true}).click();await expect(page.locator('canvas')).toBeVisible();await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');
 await page.getByRole('button',{name:'Vue d’ensemble',exact:true}).click();await expect(page.getByTestId('concept-model')).toHaveAttribute('data-selection','none');
 await page.screenshot({path:out+'/fabric-concepts-mobile.png',fullPage:true});
});
