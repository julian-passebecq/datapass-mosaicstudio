#!/usr/bin/env node
/**
 * Executed upgrade/rollback check for the browser workbench (FR-07). Two built checkouts (each with `npm ci` and
 * `npm run build` done) are served in turn by their own `vite preview` on the SAME origin, so they share one browser
 * profile and one localStorage, exactly like a user who replaces the build behind a bookmark. The browser profile
 * is closed between steps (a browser restart).
 *
 *   node scripts/release-upgrade-check.mjs --old <0.9.0 checkout> --new <0.10.0 checkout> [--port 24180]
 *        [--channel msedge] [--out <evidence dir>]
 *
 * Steps (all data synthetic: inline SQL literals):
 *   1 old  : blank workspace, one SQL cell run, autosaved.
 *   2 new  : upgrade; the saved cell is restored unchanged, runs again, nothing kept aside.
 *   3 old  : rollback; a workspace holding only SQL/note cells is restored by 0.9.0.
 *   4 new  : a Python (Jupyter) cell is added (a 0.10.0-only cell kind) and autosaved.
 *   5 old  : rollback again; 0.9.0 refuses the unknown cell kind, says so, keeps the document byte-identical under
 *            "datapass.workspace.rejected" and opens blank (the documented behaviour; nothing is deleted).
 *   6 new  : the kept-aside document is imported back with "Import workspace" and both cells return.
 * Writes <out>/upgrade-rollback.json (hashes of each stored document, observed notices) and screenshots.
 * Exit 1 on any unexpected observation. Nothing is installed, published or deleted outside the temp profile.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

const args=process.argv.slice(2),opt={port:24180,channel:null,out:null,old:null,new:null};
for(let i=0;i<args.length;i++){const k=args[i].replace(/^--/,'');if(!(k in opt)||args[i+1]===undefined){console.error('Usage: --old <dir> --new <dir> [--port N] [--channel msedge] [--out dir]');process.exit(2);}opt[k]=args[++i];}
if(!opt.old||!opt.new)throw new Error('--old and --new are required');
opt.port=Number(opt.port);if(!(opt.port>20000&&opt.port<65536))throw new Error('Use a port above 20000');
const ORIGIN=`http://127.0.0.1:${opt.port}`,KEY='datapass.workspace',REJECTED='datapass.workspace.rejected';
const out=path.resolve(opt.out??path.join(os.tmpdir(),'mosaic-upgrade-check'));await mkdir(out,{recursive:true});
const sha=s=>s===null?null:createHash('sha256').update(s).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const versionOf=dir=>JSON.parse(spawnSync(process.execPath,['-p','JSON.stringify(require("./package.json").version)'],{cwd:dir,encoding:'utf8'}).stdout);

let server=null;
async function serve(dir){
  await stop();
  if(!existsSync(path.join(dir,'dist','index.html')))throw new Error('No production build in '+dir+'/dist (run npm run build there)');
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(opt.port),'--strictPort'],{cwd:dir,stdio:['ignore','pipe','pipe']});
  let log='';server.stdout.on('data',d=>{log+=d;});server.stderr.on('data',d=>{log+=d;});
  for(let i=0;i<120;i++){try{if((await fetch(ORIGIN+'/')).ok)return;}catch{/* starting */}await pause(250);}
  throw new Error('vite preview did not start in '+dir+': '+log.slice(-800));
}
async function stop(){
  if(server&&server.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/T','/F']);else server.kill();}
  server=null;
  for(let i=0;i<40;i++){try{await fetch(ORIGIN+'/');}catch{return;}await pause(250);}
  throw new Error('The preview server still answers after stop');
}

const profile=await mkdtemp(path.join(os.tmpdir(),'mosaic-upgrade-profile-'));
const record={format:'datapass.upgrade-check',version:1,origin:ORIGIN,channel:opt.channel??'playwright-chromium',old:{dir:path.basename(opt.old),version:versionOf(opt.old)},new:{dir:path.basename(opt.new),version:versionOf(opt.new)},steps:[],ok:false};
const fail=m=>{throw new Error(m);};

async function session(label,dir,body){
  await serve(dir);
  const ctx=await chromium.launchPersistentContext(profile,{...(opt.channel?{channel:opt.channel}:{}),viewport:{width:1440,height:960},acceptDownloads:true});
  const page=ctx.pages()[0]??await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
    await page.getByTestId('runtime-state').filter({hasText:'DuckDB ready'}).waitFor({timeout:90000});
    await pause(400);
    const notice=await page.getByTestId('workspace-notice').textContent({timeout:1500}).catch(()=>null);
    const step={step:label,served:path.basename(dir),version:versionOf(dir),browser:ctx.browser()?.version()??null,notice:notice?.trim()??null};
    await body(page,step);
    await pause(900); // autosave debounce
    step.stored=await page.evaluate(([k,r])=>({workspace:localStorage.getItem(k),rejected:localStorage.getItem(r)}),[KEY,REJECTED]);
    step.storedSha256={workspace:sha(step.stored.workspace),rejected:sha(step.stored.rejected)};
    step.cells=step.stored.workspace?JSON.parse(step.stored.workspace).notebook.cells.map(c=>c.kind):[];
    await page.screenshot({path:path.join(out,`upgrade-${label}.png`),fullPage:true});
    step.pageErrors=errors;delete step.stored.workspace;delete step.stored.rejected;delete step.stored;
    record.steps.push(step);console.log(JSON.stringify(step));
    if(errors.length)fail(label+': page errors '+errors.join(' | '));
    return step;
  }finally{await ctx.close();}
}
const SQL="SELECT 'upgrade-check (synthetic)' AS label, 6*7 AS answer";
async function runFirstSql(page){
  const cell=page.getByTestId('cell').first();
  await cell.getByRole('button',{name:/^Run/}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid=cell]')?.getAttribute('data-status')==='done',null,{timeout:60000});
  const text=await cell.getByTestId('artifact').textContent();if(!text.includes('42'))fail('SQL result does not show 42');
}

try{
  let saved=null,rejectedBytes=null;
  await session('1-old-author',opt.old,async(page,step)=>{
    if(step.notice)fail('fresh profile should have no notice: '+step.notice);
    await page.getByRole('button',{name:'Add SQL cell'}).click();
    await page.getByTestId('cell').first().getByLabel(/^SQL for/).fill(SQL);
    await runFirstSql(page);
  });
  saved=record.steps[0].storedSha256.workspace;if(!saved)fail('0.9.0 did not autosave the workspace');
  await session('2-new-upgrade',opt.new,async(page,step)=>{
    if(step.notice&&/not restored/.test(step.notice))fail('0.10.0 refused the 0.9.0 workspace: '+step.notice);
    const sqlText=await page.getByTestId('cell').first().getByLabel(/^SQL for/).inputValue();if(sqlText!==SQL)fail('cell text changed on upgrade');
    await runFirstSql(page);
  });
  if(record.steps[1].storedSha256.rejected)fail('upgrade kept something aside');
  await session('3-old-rollback-sql-only',opt.old,async(page,step)=>{
    if(step.notice&&/not restored/.test(step.notice))fail('0.9.0 refused a SQL-only workspace saved by 0.10.0: '+step.notice);
    const sqlText=await page.getByTestId('cell').first().getByLabel(/^SQL for/).inputValue();if(sqlText!==SQL)fail('cell text changed on rollback');
  });
  await session('4-new-add-jupyter-cell',opt.new,async(page)=>{
    await page.getByRole('button',{name:'Add Python (Jupyter) cell'}).click();
    await page.getByTestId('cell').nth(1).getByLabel(/^Python for/).fill('answer = 6 * 7  # synthetic, never run in this check');
  });
  const before=record.steps[3].storedSha256.workspace;
  if(record.steps[3].cells.join()!=='sql,jupyter')fail('0.10.0 did not save the Jupyter cell: '+record.steps[3].cells.join());
  await session('5-old-rollback-refuses-new-kind',opt.old,async(page,step)=>{
    if(!step.notice||!/not restored/.test(step.notice)||!step.notice.includes(REJECTED))fail('expected the documented refusal notice, got: '+step.notice);
    if(await page.getByTestId('cell').count()!==0)fail('0.9.0 should open blank after refusing');
    rejectedBytes=await page.evaluate(r=>localStorage.getItem(r),REJECTED);
  });
  if(record.steps[4].storedSha256.rejected!==before)fail('the kept-aside document is not byte-identical to what 0.10.0 saved');
  const importFile=path.join(out,'kept-aside-workspace.json');await writeFile(importFile,rejectedBytes);
  await session('6-new-reimport-kept-aside',opt.new,async(page)=>{
    await page.getByLabel('Import workspace file').setInputFiles(importFile);
    await page.getByTestId('cell').nth(1).waitFor({timeout:20000});
    const kinds=await page.getByTestId('cell').count();if(kinds!==2)fail('re-import did not restore both cells');
  });
  if(record.steps[5].cells.join()!=='sql,jupyter')fail('re-import cells: '+record.steps[5].cells.join());
  record.ok=true;
}catch(e){record.error=e.message;console.error('FAIL',e.message);}
finally{
  await stop().catch(()=>{});
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
  await writeFile(path.join(out,'upgrade-rollback.json'),JSON.stringify(record,null,2)+'\n');
  console.log((record.ok?'PASS':'FAIL')+' upgrade/rollback '+record.old.version+' <-> '+record.new.version+' ('+record.channel+'); record: '+path.join(out,'upgrade-rollback.json'));
  process.exitCode=record.ok?0:1;
}
