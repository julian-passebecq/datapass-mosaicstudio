/**
 * Writes the static 2D diagrams for every atlas spec into clients/arch-atlas/qa/diagrams/.
 * Same spec, same bytes: the files are committed and the unit test compares their hashes.
 * Usage: node --experimental-strip-types clients/arch-atlas/tools/export-svg.mjs [--png]
 */
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {specs} from '../specs/index.ts';
import {layeredSvg,isometricSvg} from '../svg.ts';

const out=path.resolve('clients/arch-atlas/qa/diagrams');await mkdir(out,{recursive:true});
const files=[];
for(const spec of specs){
  for(const [kind,svg] of [['layered',layeredSvg(spec)],['isometric',isometricSvg(spec)]]){
    const file=path.join(out,`${spec.id}.${kind}.svg`);await writeFile(file,svg);files.push(file);
  }
}
if(process.argv.includes('--png')){
  const {chromium}=await import('@playwright/test');const browser=await chromium.launch();
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const file of files){
    const {readFile}=await import('node:fs/promises');const svg=await readFile(file,'utf8');
    const [,,w,h]=/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg).slice(1).map(Number).map((v,i)=>i<2?v:v);
    await page.setViewportSize({width:Math.ceil(w),height:Math.ceil(h)});
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ','<svg style="display:block;width:100vw;height:100vh" ')}</body></html>`);
    await page.screenshot({path:file.replace(/\.svg$/,'.png')});
  }
  await browser.close();
}
console.log(files.map(f=>path.relative(process.cwd(),f).replaceAll('\\','/')).join('\n'));
