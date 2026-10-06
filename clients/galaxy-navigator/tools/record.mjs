/**
 * Deterministic recording of the 3D Galaxy camera tour. Every frame is rendered at a fixed virtual time through
 * window.__galaxy3d.seek(t), so the video depends only on t, never on wall-clock speed. Encodes H.264 MP4 with
 * ffmpeg taken from the FFMPEG environment variable (or PATH). Serves the built client itself (vite preview).
 *
 * Usage (repo root, after `npm run build:client -- galaxy-navigator`):
 *   FFMPEG=/path/to/ffmpeg node clients/galaxy-navigator/tools/record.mjs [--size 1280x720] [--fps 30] [--scheme light|dark]
 *     [--stills 1,6,10.5,14.5,18,23] [--stills-only] [--out clients/galaxy-navigator/qa/tour]
 */
import {chromium} from '@playwright/test';
import {mkdir,rm,copyFile,writeFile,stat} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:'true']);return a;},[]));
const port=Number(args.port??4194),url=`http://127.0.0.1:${port}/`;
const [width,height]=(args.size??'1280x720').split('x').map(Number),fps=Number(args.fps??30),scheme=args.scheme??'light';
const out=path.resolve(args.out??'clients/galaxy-navigator/qa/tour'),frames=path.join(out,'frames');
const stills=(args.stills??'1,6,10.5,14.5,18,23').split(',').map(Number),stillsOnly=args['stills-only']==='true';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:'galaxy-navigator'},stdio:'ignore'});
let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=(await fetch(url)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
if(!ready){server.kill();throw new Error('Preview failed to start on '+url);}
const browser=await chromium.launch({args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=default']});
const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference',colorScheme:scheme});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${url}?tour=1&paused=1&t=0&film=1`,{timeout:120000});
await page.waitForFunction(()=>!!window.__galaxy3d&&!!document.querySelector('[data-testid=gn-3d-canvas] canvas'),null,{timeout:120000});
const duration=await page.evaluate(()=>window.__galaxy3d.duration);
const seek=async t=>{await page.evaluate(t=>window.__galaxy3d.seek(t),t);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));};
const frameName=i=>path.join(frames,'frame_'+String(i).padStart(5,'0')+'.png');
const stillName=t=>path.join(out,'still-'+t.toFixed(1).padStart(4,'0')+'s.png');
await mkdir(out,{recursive:true});
const started=Date.now();let count=0;
try{
  if(stillsOnly){for(const t of stills){await seek(t);await page.screenshot({path:stillName(t)});}}
  else{
    await rm(frames,{recursive:true,force:true});await mkdir(frames,{recursive:true});
    const last=Math.round(duration*fps)-1;
    for(let i=0;i<=last;i++){await seek(i/fps);await page.screenshot({path:frameName(i)});count++;if(count%120===0)console.log('frame '+i+' / '+last+' ('+((Date.now()-started)/1000).toFixed(0)+' s)');}
    for(const t of stills){const i=Math.round(t*fps);if(i<count)await copyFile(frameName(i),stillName(t));}
  }
}finally{await browser.close();server.kill();}
const report={format:'galaxy-navigator.tour-recording',version:1,duration,fps,size:width+'x'+height,scheme,frames:count,seconds:Math.round((Date.now()-started)/1000),
  stills:stills.map(t=>path.relative(process.cwd(),stillName(t)).replaceAll('\\','/')),video:null,errors};
if(count){
  const ffmpeg=process.env.FFMPEG||'ffmpeg',file=path.join(out,'galaxy-tour.mp4');
  const r=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-framerate',String(fps),'-i',path.join(frames,'frame_%05d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','26','-preset','slow','-movflags','+faststart',file],{encoding:'utf8'});
  if(r.status===0){report.video=path.relative(process.cwd(),file).replaceAll('\\','/');report.bytes=(await stat(file)).size;await rm(frames,{recursive:true,force:true});}
  else report.encodeError=(r.stderr||r.error?.message||'ffmpeg failed').slice(0,400)+' (PNG frames kept)';
}
await writeFile(path.join(out,'tour-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({frames:report.frames,video:report.video,bytes:report.bytes,encodeError:report.encodeError,errors:errors.length,seconds:report.seconds}));
if(errors.length||report.encodeError)process.exitCode=1;
