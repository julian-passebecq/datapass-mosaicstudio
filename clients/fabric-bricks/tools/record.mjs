/**
 * Deterministic export of the Fabric Bricks build film.
 * Renders every frame at a fixed time step through the client's own time parameter (window.__fabricFilm.seek),
 * so the output depends only on t, never on wall-clock speed. Encodes an MP4 when ffmpeg is on PATH (or FFMPEG=...);
 * otherwise falls back to Playwright's bundled ffmpeg (WebM/VP8) or leaves the PNG frames and says so.
 *
 * Usage (with the client served, e.g. `npm run client:dev -- fabric-bricks --port 5191`):
 *   node clients/fabric-bricks/tools/record.mjs --url http://127.0.0.1:5191 [--size 1280x720] [--fps 30] [--duration 25]
 *        [--stills 5,7,10,15,20] [--stills-only] [--from 0] [--to 25] [--out clients/fabric-bricks/qa/film] [--gl default|swiftshader]
 */
import {chromium} from '@playwright/test';
import {mkdir,rm,copyFile,writeFile,stat,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:'true']);return a;},[]));
const url=(args.url??process.env.FABRIC_URL??'http://127.0.0.1:5178').replace(/\/$/,'');
const [width,height]=(args.size??'1280x720').split('x').map(Number);
const fps=Number(args.fps??30),duration=Number(args.duration??25);
const out=path.resolve(args.out??'clients/fabric-bricks/qa/film'),frames=path.join(out,'frames');
const stills=(args.stills??'5,7,10,15,20').split(',').map(Number);
const stillsOnly=args['stills-only']==='true';
const from=Number(args.from??0),to=Number(args.to??duration);
if(!(width>0&&height>0&&fps>0&&duration>0))throw new Error('Invalid --size/--fps/--duration');

const glArgs=args.gl==='swiftshader'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=default'];
const browser=await chromium.launch({args:glArgs});
const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url+'/?app=fabric-bricks&film=1&paused=1&chrome=0&t=0');
await page.waitForFunction(()=>!!window.__fabricFilm&&!!document.querySelector('canvas[data-renderer=fabric-film-webgl2]'),null,{timeout:120000});
const renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas[data-renderer=fabric-film-webgl2]').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
const seek=async t=>{const shown=await page.evaluate(t=>window.__fabricFilm.seek(t),t);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));return shown;};
const name=i=>path.join(frames,'frame_'+String(i).padStart(5,'0')+'.png');
const stillName=t=>path.join(out,'still-'+t.toFixed(1).padStart(4,'0')+'s.png');

function findFfmpeg(){
  const candidates=[process.env.FFMPEG,'ffmpeg'].filter(Boolean);
  for(const c of candidates){const r=spawnSync(c,['-hide_banner','-encoders'],{encoding:'utf8'});if(r.status===0)return {bin:c,h264:/libx264/.test(r.stdout),vp9:/libvpx-vp9/.test(r.stdout),bundled:false};}
  const root=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'.cache'),'ms-playwright');
  if(existsSync(root))for(const dir of spawnSync(process.platform==='win32'?'cmd':'ls',process.platform==='win32'?['/c','dir','/b',root]:[root],{encoding:'utf8'}).stdout.split(/\r?\n/).filter(d=>d.startsWith('ffmpeg'))){
    const bin=path.join(root,dir,process.platform==='win32'?'ffmpeg-win64.exe':'ffmpeg-linux');if(existsSync(bin))return {bin,h264:false,vp9:false,bundled:true};
  }
  return null;
}
const ff=stillsOnly?null:findFfmpeg(),jpegs=[];
await mkdir(out,{recursive:true});
const started=Date.now();let count=0;
if(stillsOnly){
  for(const t of stills){await seek(t);await page.screenshot({path:stillName(t)});}
}else{
  await rm(frames,{recursive:true,force:true});await mkdir(frames,{recursive:true});
  const first=Math.round(from*fps),last=Math.min(Math.round(duration*fps)-1,Math.round(to*fps));
  for(let i=first;i<=last;i++){
    await seek(i/fps);await page.screenshot({path:name(i-first)});count++;
    // Playwright's bundled ffmpeg only reads piped MJPEG, so keep a JPEG copy of each frame for it.
    if(ff?.bundled)jpegs.push(await page.screenshot({type:'jpeg',quality:94}));
    if(count%60===0)console.log('frame '+i+' / '+last+' ('+((Date.now()-started)/1000).toFixed(0)+' s)');
  }
  for(const t of stills){const i=Math.round(t*fps)-first;if(i>=0&&i<count)await copyFile(name(i),stillName(t));}
}
await browser.close();

const report={duration,fps,size:width+'x'+height,frames:count,renderer,seconds:Math.round((Date.now()-started)/1000),stills:stills.map(t=>path.relative(process.cwd(),stillName(t)).replaceAll('\\','/')),video:null,encoder:null,errors};
if(!stillsOnly&&count){
  if(ff){
    const mp4=ff.h264,file=path.join(out,'fabric-bricks-film.'+(mp4?'mp4':'webm'));
    const codec=mp4?['-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','slow','-movflags','+faststart']:ff.vp9?['-c:v','libvpx-vp9','-b:v','0','-crf','32','-pix_fmt','yuv420p']:['-c:v','libvpx','-b:v','3M','-crf','8','-qmin','0','-qmax','40','-pix_fmt','yuv420p','-auto-alt-ref','0'];
    const input=ff.bundled?['-f','image2pipe','-c:v','mjpeg','-framerate',String(fps),'-i','pipe:0']:['-framerate',String(fps),'-i',path.join(frames,'frame_%05d.png')];
    const r=spawnSync(ff.bin,['-y','-hide_banner','-loglevel','error',...input,...codec,file],{encoding:'utf8',input:ff.bundled?Buffer.concat(jpegs):undefined,maxBuffer:1<<26});
    if(r.status===0){report.video=path.relative(process.cwd(),file).replaceAll('\\','/');report.bytes=(await stat(file)).size;report.encoder=(ff.bundled?'playwright-bundled ':'')+path.basename(ff.bin)+' '+codec[1];if(ff.bundled)report.note='No ffmpeg on PATH: WebM/VP8 via Playwright ffmpeg. Set FFMPEG=... or add ffmpeg to PATH for MP4/H.264.';}
    else report.encodeError=(r.stderr||r.error?.message||'ffmpeg failed').slice(0,400);
  }else report.encodeError='No ffmpeg on PATH (set FFMPEG=...). PNG frames kept in '+path.relative(process.cwd(),frames);
}
await writeFile(path.join(out,'film-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({frames:report.frames,video:report.video,bytes:report.bytes,encoder:report.encoder,encodeError:report.encodeError,renderer,errors:errors.length,seconds:report.seconds}));
if(errors.length)process.exitCode=1;
