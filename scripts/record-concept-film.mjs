/**
 * Deterministic export of a concept spec film (rise from the lake, pan across domains, focus a node,
 * end on the layer cake). Every frame is rendered at a fixed time step through window.__conceptFilm.seek (virtual clock),
 * so the output depends only on t, never on wall-clock speed. Encodes H.264 MP4 with ffmpeg (FFMPEG=... or PATH).
 *
 * Usage (client served, e.g. `npm run client:dev -- arch-atlas --port 5193`):
 *   FFMPEG=/path/to/ffmpeg node scripts/record-concept-film.mjs --url http://127.0.0.1:5193
 *     [--app arch-atlas|concept-viewer] [--spec fabric-platform | examples/forecast-app.concept.json]
 *     [--size 1280x720] [--fps 30] [--stills 1,7,15,21.5,27] [--stills-only] [--out clients/<app>/qa/film]
 */
import {chromium} from '@playwright/test';
import {mkdir,rm,copyFile,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:'true']);return a;},[]));
const url=(args.url??'http://127.0.0.1:5193').replace(/\/$/,''),app=args.app??'arch-atlas',spec=args.spec??'fabric-platform';
const [width,height]=(args.size??'1280x720').split('x').map(Number),fps=Number(args.fps??30);
const out=path.resolve(args.out??`clients/${app}/qa/film`),frames=path.join(out,'frames');
const stills=(args.stills??'1,7,15,21.5,27').split(',').map(Number),stillsOnly=args['stills-only']==='true';
const browser=await chromium.launch({args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=default']});
const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${url}/?app=${app}&film=1&paused=1&chrome=0&t=0&spec=${encodeURIComponent(spec)}`,{timeout:180000});
await page.waitForFunction(()=>!!window.__conceptFilm&&!!document.querySelector('[data-testid=atlas-film] canvas[data-renderer=concept-webgl2]'),null,{timeout:180000});
const duration=await page.evaluate(()=>window.__conceptFilm.duration);
const seek=async t=>{await page.evaluate(t=>window.__conceptFilm.seek(t),t);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));};
const frameName=i=>path.join(frames,'frame_'+String(i).padStart(5,'0')+'.png');
const stillName=t=>path.join(out,'still-'+t.toFixed(1).padStart(4,'0')+'s.png');
await mkdir(out,{recursive:true});
const started=Date.now();let count=0;
if(stillsOnly){for(const t of stills){await seek(t);await page.screenshot({path:stillName(t)});}}
else{
  await rm(frames,{recursive:true,force:true});await mkdir(frames,{recursive:true});
  const last=Math.round(duration*fps)-1;
  for(let i=0;i<=last;i++){await seek(i/fps);await page.screenshot({path:frameName(i)});count++;if(count%90===0)console.log('frame '+i+' / '+last+' ('+((Date.now()-started)/1000).toFixed(0)+' s)');}
  for(const t of stills){const i=Math.round(t*fps);if(i<count)await copyFile(frameName(i),stillName(t));}
}
await browser.close();
const report={app,spec,duration,fps,size:width+'x'+height,frames:count,seconds:Math.round((Date.now()-started)/1000),stills:stills.map(t=>path.relative(process.cwd(),stillName(t)).replaceAll('\\','/')),video:null,errors};
if(count){
  const ffmpeg=process.env.FFMPEG||'ffmpeg',file=path.join(out,(args.name??app+'-film')+'.mp4');
  const r=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-framerate',String(fps),'-i',path.join(frames,'frame_%05d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','24','-preset','slow','-movflags','+faststart',file],{encoding:'utf8'});
  if(r.status===0){report.video=path.relative(process.cwd(),file).replaceAll('\\','/');report.bytes=(await stat(file)).size;await rm(frames,{recursive:true,force:true});}
  else report.encodeError=(r.stderr||r.error?.message||'ffmpeg failed').slice(0,400)+' (PNG frames kept)';
}
await writeFile(path.join(out,'film-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({frames:report.frames,video:report.video,bytes:report.bytes,encodeError:report.encodeError,errors:errors.length,seconds:report.seconds}));
if(errors.length)process.exitCode=1;
