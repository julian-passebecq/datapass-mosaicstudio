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
if(!existsSync(opt.exe)){record.result='UNKNOWN';record.reason='Positron is not installed at '+opt.exe;await mkdir(opt.out,{recursive:true});await writeFile(path.join(opt.out,'positron-viewer.json'),JSON.stringify(record,null,2)+'\n');console.log(record.reason);process.exit(1);}
const product=JSON.parse(readFileSync(path.join(path.dirname(opt.exe),'resources','app','product.json'),'utf8'));
record.positron={version:product.positronVersion,build:product.positronBuildNumber,codeVersion:product.version,commit:product.commit};
await mkdir(opt.out,{recursive:true});
const userData=await mkdtemp(path.join(os.tmpdir(),'positron-user-')),extensions=await mkdtemp(path.join(os.tmpdir(),'positron-ext-')),folder=await mkdtemp(path.join(os.tmpdir(),'positron-folder-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let app=null;
try{
  app=await electron.launch({executablePath:opt.exe,args:[`--user-data-dir=${userData}`,`--extensions-dir=${extensions}`,'--disable-workspace-trust','--skip-welcome','--skip-release-notes','--disable-telemetry',folder],timeout:120000});
  const win=await app.firstWindow({timeout:120000});
  await win.waitForLoadState('domcontentloaded');
  await win.locator('.monaco-workbench').waitFor({timeout:120000});
  await pause(4000);
  await win.keyboard.press('F1');
  await win.locator('.quick-input-widget input').waitFor({timeout:20000});
  await win.keyboard.type('Open URL in Viewer');
  await pause(800);
  await win.keyboard.press('Enter');
  await pause(800);
  await win.keyboard.type(opt.url);
  await win.keyboard.press('Enter');
  let frame=null;
  for(let i=0;i<120&&!frame;i++){frame=win.frames().find(f=>f.url().startsWith(opt.url.replace(/\/$/,'')))??null;if(!frame)await pause(500);}
  if(!frame)throw new Error('No Viewer frame loaded '+opt.url+'; frames: '+win.frames().map(f=>f.url().slice(0,80)).join(' | '));
  record.frameUrl=frame.url();
  await frame.getByTestId('runtime-state').filter({hasText:'DuckDB ready'}).waitFor({timeout:90000});
  record.observed={runtimeState:(await frame.getByTestId('runtime-state').textContent())?.trim(),header:(await frame.locator('.header-context').textContent().catch(()=>null))?.trim()??null,notebookEmpty:await frame.getByTestId('notebook-empty').isVisible().catch(()=>false)};
  await pause(1500);
  await win.screenshot({path:path.join(opt.out,'positron-viewer.png')});
  record.extensionsDir=readdirSync(extensions);
  record.ok=record.observed.runtimeState==='DuckDB ready'&&record.extensionsDir.filter(n=>!n.startsWith('.')&&n!=='extensions.json').length===0;
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
