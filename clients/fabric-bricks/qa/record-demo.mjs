import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='clients/fabric-bricks/qa/captures';await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});
const page=await context.newPage(),video=page.video();
await page.goto((process.env.FABRIC_URL??'http://127.0.0.1:5178')+'/?app=fabric-bricks');
await page.getByRole('button',{name:'Open Lakehouse',exact:true}).waitFor();await page.waitForTimeout(1500);
await page.getByRole('button',{name:'Open Lakehouse',exact:true}).click();await page.locator('canvas').waitFor();await page.waitForTimeout(2400);
await page.locator('.fb-explode-toggle').click();await page.waitForTimeout(1800);
await page.locator('.fb-part-row').filter({hasText:'Boardwalk tile'}).click();await page.locator('.fb-inspector-tools>button').click();await page.waitForTimeout(2200);
await page.getByRole('button',{name:'Reset model view',exact:true}).click();await page.getByRole('button',{name:'Build step 1: Foundation',exact:true}).click();await page.waitForTimeout(700);
for(let n=2;n<=6;n++){await page.locator('.fb-step-track button').nth(n-1).click();await page.waitForTimeout(650);}
await page.getByRole('button',{name:'Back to all kits',exact:true}).click();await page.waitForTimeout(1200);
await page.getByRole('button',{name:'Open Power BI',exact:true}).click();await page.locator('canvas').waitFor();await page.waitForTimeout(1600);
await page.getByRole('button',{name:'Back to all kits',exact:true}).click();await page.waitForTimeout(1000);
await context.close();await video.saveAs(out+'/fabric-bricks-demo.webm');await browser.close();
await writeFile(out+'/demo-note.txt','Recorded from the actual local Fabric Bricks client; synthetic models and illustrative costs. No source video frames are used.\n');
console.log(out+'/fabric-bricks-demo.webm');
