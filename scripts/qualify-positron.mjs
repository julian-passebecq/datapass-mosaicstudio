#!/usr/bin/env node
/**
 * Native-host check (FR-07): open a running workbench URL in the Positron Viewer of an installed Positron, with a
 * fresh profile and an EMPTY extensions folder (so no VSIX, in particular no datapass-mosaic-vscode, can be involved).
 * Uses Positron's own "Viewer: Open URL in Viewer" command and Playwright's Electron driver; nothing is installed.
 *
 *   node scripts/qualify-positron.mjs --url http://127.0.0.1:24173/ [--exe <Positron.exe>] [--out <dir>]
 *
 * Writes <out>/positron-viewer.png and <out>/positron-viewer.json (Positron version, extensions folder listing,
 * the frame that rendered the URL and what it showed). Exit 1 when the workbench is not observed inside the Viewer.
 */
import {_electron as electron} from '@playwright/test';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args=process.argv.slice(2),opt={url:null,exe:path.join(process.env.LOCALAPPDATA??'','Programs','Positron','Positron.exe'),out:path.join(os.tmpdir(),'mosaic-positron-check')};
for(let i=0;i<args.length;i++){const k=args[i].replace(/^--/,'');if(!(k in opt)||args[i+1]===undefined){console.error('Usage: --url <http://127.0.0.1:PORT/> [--exe Positron.exe] [--out dir]');process.exit(2);}opt[k]=args[++i];}
if(!opt.url||!/^http:\/\/127\.0\.0\.1:\d+\//.test(opt.url))throw new Error('--url must be a loopback http URL');
const record={format:'datapass.native-host-check',version:1,host:'Positron',url:opt.url,ok:false};
await mkdir(opt.out,{recursive:true});
if(!existsSync(opt.exe)){record.result='UNKNOWN';record.reason='Positron is not installed at '+opt.exe;await writeFile(path.join(opt.out,'positron-viewer.json'),JSON.stringify(record,null,2)+'\n');console.log(record.reason);process.exit(1);}
const product=JSON.parse(readFileSync(path.join(path.dirname(opt.exe),'resources','app','product.json'),'utf8'));
record.positron={version:product.positronVersion,build:product.positronBuildNumber,codeVersion:product.version,commit:product.commit};
const userData=await mkdtemp(path.join(os.tmpdir(),'positron-user-')),extensions=await mkdtemp(path.join(os.tmpdir(),'positron-ext-')),folder=await mkdtemp(path.join(os.tmpdir(),'positron-folder-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let app=null;
try{
  app=await electron.launch({executablePath:opt.exe,args:[`--user-data-dir=${userData}`,`--extensions-dir=${extensions}`,'--disable-workspace-trust','--skip-welcome','--skip-release-notes','--disable-telemetry',folder],timeout:120000});
  const win=await app.firstWindow({timeout:120000});
  await win.waitForLoadState('domcontentloaded');
  await win.locator('.monaco-workbench').waitFor({timeout:120000});
  // Let start-up settle (interpreter discovery moves focus, and a quick input closes when focus is lost).
  await win.getByText('There is no session running').first().waitFor({timeout:120000}).catch(()=>{});
  await pause(3000);
  // Open the command palette (shortcut, else the View menu), run "Viewer: Open URL in Viewer" and answer its URL prompt.
  // The sequence is retried because a quick input closes when start-up activity takes the focus.
  const input=win.locator('.quick-input-widget input');
  const visible=ms=>input.waitFor({timeout:ms}).then(()=>true,()=>false);
  record.attempts=[];
  for(let attempt=1;attempt<=4&&!record.urlSubmitted;attempt++){
    const step={attempt};record.attempts.push(step);
    try{
      await win.keyboard.press('Escape').catch(()=>{});
      await win.keyboard.press('Control+Shift+P');
      if(!await visible(5000)){await win.getByRole('menuitem',{name:'View'}).first().click();await win.getByRole('menuitem',{name:/Command Palette/}).first().click();}
      if(!await visible(5000))throw new Error('command palette did not open');
      await win.keyboard.type('Viewer: Open URL in Viewer');
      const row=win.locator('.quick-input-list .monaco-list-row',{hasText:'Open URL in Viewer'}).first();
      await row.waitFor({timeout:20000});
      if(attempt===1)await win.screenshot({path:path.join(opt.out,'positron-step-command.png')});
      await row.click();
      if(!await visible(8000)){await win.screenshot({path:path.join(opt.out,`positron-step-noprompt-${attempt}.png`)});throw new Error('URL prompt did not appear');}
      await input.fill(opt.url);
      await win.screenshot({path:path.join(opt.out,'positron-step-url.png')});
      await input.press('Enter');
      record.urlSubmitted=true;step.ok=true;
    }catch(e){step.error=e.message.split('\n')[0];await pause(3000);}
  }
  if(!record.urlSubmitted)throw new Error('Could not submit the URL to "Open URL in Viewer"');
  let frame=null;
  for(let i=0;i<120&&!frame;i++){frame=win.frames().find(f=>f.url().startsWith(opt.url.replace(/\/$/,'')))??null;if(!frame)await pause(500);}
  if(!frame)throw new Error('No Viewer frame loaded '+opt.url+'; frames: '+win.frames().map(f=>f.url().slice(0,80)).join(' | '));
  record.frameUrl=frame.url();
  // The narrow Viewer hides the header status chip (responsive layout), so read its text rather than its visibility.
  await frame.waitForFunction(()=>document.querySelector('[data-testid=runtime-state]')?.textContent?.includes('DuckDB ready'),null,{timeout:90000});
  record.observed={runtimeState:(await frame.getByTestId('runtime-state').textContent())?.trim(),notebookEmpty:await frame.getByTestId('notebook-empty').isVisible().catch(()=>false)};
  // First useful task inside the Viewer: one SQL cell on the in-page DuckDB (synthetic literal).
  await frame.getByRole('button',{name:'Add SQL cell'}).click();
  const cell=frame.getByTestId('cell').first();
  await cell.getByLabel(/^SQL for/).fill("SELECT 'positron viewer (synthetic)' AS label, 6*7 AS answer");
  await cell.getByRole('button',{name:/^Run/}).click();
  await frame.waitForFunction(()=>document.querySelector('[data-testid=cell]')?.getAttribute('data-status')==='done',null,{timeout:60000});
  record.observed.sqlResult=(await cell.getByTestId('artifact').textContent())?.includes('42')?'42':'missing';
  await cell.scrollIntoViewIfNeeded().catch(()=>{});
  await pause(1500);
  await win.screenshot({path:path.join(opt.out,'positron-viewer.png')});
  // A fresh Positron profile installs Positron's own bundled extensions on first start; none may be a DataPass/Mosaic VSIX.
  record.extensionsDir=readdirSync(extensions).filter(n=>!n.startsWith('.')&&n!=='extensions.json');
  record.datapassExtensions=record.extensionsDir.filter(n=>/datapass|mosaic/i.test(n));
  record.ok=record.observed.runtimeState==='DuckDB ready'&&record.observed.sqlResult==='42'&&record.datapassExtensions.length===0;
  record.result=record.ok?'PASS':'FAIL';
}catch(e){record.result='FAIL';record.error=e.message;console.error('FAIL',e.message);try{const w=app&&app.windows()[0];if(w)await w.screenshot({path:path.join(opt.out,'positron-viewer-failure.png')});}catch{/* no window */}}
finally{
  try{await app?.close();}catch{/* already closed */}
  await pause(1000);
  for(const d of [userData,extensions,folder])await rm(d,{recursive:true,force:true}).catch(()=>{});
  await writeFile(path.join(opt.out,'positron-viewer.json'),JSON.stringify(record,null,2)+'\n');
  console.log(record.result+' Positron '+(record.positron?.version??'?')+' Viewer: '+opt.url);
  process.exitCode=record.ok?0:1;
}
