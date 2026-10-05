/** Fabric-style product video of the viz gallery (2D overview -> 3D explorer), recorded
 * deterministically: the page runs with `?record=1`, so every tween (KPI count-ups, bar and
 * column transitions, camera keyframes) runs on one VirtualClock that this script advances by
 * exactly 1/30 s per frame. Each frame is a complete screenshot: no frame blending, no
 * crossfades. A synthetic cursor, click ripples and lower-third captions are drawn as page
 * overlays whose state is a pure function of the frame number.
 *
 * Usage: node tools/record_gallery.mjs [--no-build] [--ffmpeg <path>] [--out docs/media/viz-gallery]
 *   FFMPEG env var also works. Output: gallery.mp4 (1280x720, 30 fps, H.264), 6 stills and
 *   metadata.json (timeline, captions, hashes, frame checks). SYNTHETIC data only.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const FFMPEG=arg('--ffmpeg',process.env.FFMPEG||'ffmpeg');
const OUT=path.resolve(arg('--out','docs/media/viz-gallery'));
const id='fabric-gallery-reference',port=4197,base=`http://127.0.0.1:${port}/`;
const FPS=30,W=1280,H=720,SCALE=1.5,STEP=1000/FPS;
const sha=b=>createHash('sha256').update(b).digest('hex');

/* ---------- overlays (cursor, ripple, caption) installed in the page ---------- */
const OVERLAY=`(()=>{
  const css=document.createElement('style');css.textContent=\`
  #rec-cursor{position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;transform-origin:3px 2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  #rec-ripple{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #2ec4b6;z-index:2147483646;pointer-events:none;opacity:0}
  #rec-cap{position:fixed;left:84px;bottom:44px;z-index:2147483645;pointer-events:none;display:flex;gap:14px;align-items:stretch;padding:14px 22px 14px 16px;border-radius:10px;
    background:rgba(10,13,18,.86);box-shadow:0 12px 32px rgba(0,0,0,.35);backdrop-filter:blur(6px);font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;opacity:0}
  #rec-cap i{width:4px;border-radius:2px;background:#2ec4b6}
  #rec-cap b{display:block;font-size:22px;font-weight:600;letter-spacing:-.01em;color:#fff;line-height:1.2}
  #rec-cap span{display:block;margin-top:3px;font-size:14px;color:#b8c2cf;line-height:1.3}
  html,body{scroll-behavior:auto!important}\`;
  document.head.append(css);
  const cursor=document.createElementNS('http://www.w3.org/2000/svg','svg');cursor.id='rec-cursor';cursor.setAttribute('viewBox','0 0 24 24');
  cursor.innerHTML='<path d="M3 2 L3 19 L7.6 14.8 L10.6 21.4 L13.6 20.1 L10.7 13.6 L16.8 13.4 Z" fill="#fff" stroke="#0b0f14" stroke-width="1.4" stroke-linejoin="round"/>';
  const ripple=document.createElement('div');ripple.id='rec-ripple';
  const cap=document.createElement('div');cap.id='rec-cap';cap.innerHTML='<i></i><div><b></b><span></span></div>';
  document.body.append(ripple,cap,cursor);
  window.__rec={
    cursor(x,y,pressed,visible){cursor.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) translate(-3px,-2px) scale('+(pressed?0.86:1)+')';cursor.style.opacity=visible?'1':'0';},
    ripple(x,y,t){if(t<0||t>1){ripple.style.opacity='0';return;}ripple.style.left=x+'px';ripple.style.top=y+'px';ripple.style.opacity=String((1-t)*0.9);ripple.style.transform='scale('+(0.35+t*0.9)+')';},
    caption(title,sub,o){cap.querySelector('b').textContent=title;cap.querySelector('span').textContent=sub;cap.style.opacity=String(o);cap.style.transform='translateY('+((1-o)*14).toFixed(1)+'px)';},
  };
})()`;

/* ---------- captions: event-driven lower thirds ---------- */
const CAPTION_FADE=9;// frames
/** Opacity of a caption shown at frame `from` and hidden at `to` (null = still shown). */
function captionOpacity(c,f){const a=Math.min(1,(f-c.from)/CAPTION_FADE),b=c.to===null?1:1-(f-c.to)/CAPTION_FADE;return Math.max(0,Math.min(a,b));}
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

async function main(){
  if(!process.argv.includes('--no-build')){const b=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs',id],{stdio:'inherit'});if(b.status!==0)process.exit(b.status||1);}
  const version=spawnSync(FFMPEG,['-hide_banner','-version'],{encoding:'utf8'});if(version.status!==0)throw new Error('ffmpeg not found: pass --ffmpeg <path> or set FFMPEG');
  await mkdir(OUT,{recursive:true});const tmp=path.join(OUT,'.frames');await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:id},stdio:'ignore'});
  const browser=await chromium.launch();
  const video=path.join(OUT,'gallery.mp4');
  const ff=spawn(FFMPEG,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','png','-i','-','-vf',`scale=${W}:${H}:flags=lanczos,format=yuv420p`,'-c:v','libx264','-preset','slow','-crf','22','-tune','animation','-movflags','+faststart','-r',String(FPS),video],{stdio:['pipe','inherit','inherit']});
  const ffDone=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg exited '+c))));
  const timeline=[],stills=[];let frame=0,captionsOut=[];
  try{
    let ready=false;for(let i=0;i<200&&!ready;i++){try{ready=(await fetch(base)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
    if(!ready)throw new Error('preview did not start');
    const context=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:SCALE,reducedMotion:'no-preference'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?record=1');await page.getByTestId('fabric-gallery').waitFor({timeout:60000});
    await page.evaluate(OVERLAY);await page.waitForFunction(()=>!!window.__vizClock);
    await page.evaluate(()=>document.fonts.ready);
    const state={x:W-60,y:H-40,pressed:false,visible:true,ripple:null};
    const t=()=>frame/FPS,captions=[];
    /** Show a lower third now; the previous one fades out first (CAPTION_FADE frames). */
    function caption(title,sub){const prev=captions.at(-1);let from=frame;if(prev&&prev.to===null){prev.to=frame;from=frame+CAPTION_FADE;}captions.push({title,sub,from,to:null});}
    function hideCaption(){const prev=captions.at(-1);if(prev&&prev.to===null)prev.to=frame;}
    const captionNow=()=>{for(let k=captions.length-1;k>=0;k--){const c=captions[k];if(frame>=c.from){const o=captionOpacity(c,frame);return o>0?{...c,o}:null;}}return null;};
    /** Render one frame: overlays, clock step, wait for React + WebGL, screenshot. */
    async function shot(note){
      const c=captionNow(),r=state.ripple;
      await page.evaluate(([s,c,r,f])=>{window.__rec.cursor(s.x,s.y,s.pressed,s.visible);window.__rec.ripple(r?r.x:0,r?r.y:0,r?(f-r.f)/14:-1);window.__rec.caption(c?c.title:'',c?c.sub:'',c?c.o:0);},[state,c,r,frame]);
      await page.evaluate(ms=>window.__vizClock.advance(ms,ms/2),STEP);
      await page.evaluate(()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(res,0)))));
      const png=await page.screenshot({type:'png',animations:'disabled',caret:'hide'});
      if(!ff.stdin.write(png))await new Promise(res=>ff.stdin.once('drain',res));
      if(note){timeline.push({frame,t:+t().toFixed(3),note});}
      frame++;return png;
    }
    async function hold(seconds,note){for(let i=0,n=Math.round(seconds*FPS);i<n;i++)await shot(i===0?note:undefined);}
    async function still(name,label){const png=await shot('still:'+name);const file=path.join(tmp,name+'.png');await writeFile(file,png);stills.push({name,label,frame:frame-1,t:+((frame-1)/FPS).toFixed(3),file});}
    /** Glide the cursor (and the real mouse, for hover) to a point. */
    async function glide(to,seconds,note){
      const from={x:state.x,y:state.y},n=Math.max(1,Math.round(seconds*FPS));
      for(let i=1;i<=n;i++){const k=ease(i/n);state.x=from.x+(to.x-from.x)*k;state.y=from.y+(to.y-from.y)*k;await page.mouse.move(state.x,state.y);await shot(i===1?note:undefined);}
    }
    async function click(note){state.pressed=true;await shot(note);await page.mouse.down();await page.mouse.up();state.ripple={x:state.x,y:state.y,f:frame};state.pressed=false;}
    /** Drag along points, one segment per `perSegment` seconds. */
    async function drag(points,perSegment,note){
      state.pressed=true;await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await shot(note);
      for(let s=1;s<points.length;s++){const a=points[s-1],b=points[s],n=Math.max(1,Math.round(perSegment*FPS));for(let i=1;i<=n;i++){const k=i/n;state.x=a.x+(b.x-a.x)*k;state.y=a.y+(b.y-a.y)*k;await page.mouse.move(state.x,state.y);await shot();}}
      await page.mouse.up();state.pressed=false;
    }
    async function scrollTo(y,seconds,note){
      const from=await page.evaluate(()=>scrollY),n=Math.max(1,Math.round(seconds*FPS));
      for(let i=1;i<=n;i++){await page.evaluate(v=>window.scrollTo(0,v),from+(y-from)*ease(i/n));await shot(i===1?note:undefined);}
    }
    const center=async locator=>{const b=await locator.boundingBox();if(!b)throw new Error('No box for '+locator);return {x:b.x+b.width/2,y:b.y+b.height/2,box:b};};
    const docY=async locator=>{const b=await locator.boundingBox();return b.y+await page.evaluate(()=>scrollY);};

    // Overview: KPI count-ups.
    caption('Contoso sales, one viz kit','Fluent tokens · SVG + Canvas · 120,000 synthetic orders');
    await hold(1.4,'overview: KPI count-ups');
    await still('01-overview','2D overview, KPIs counted up');
    await hold(1.0);
    // Click a bar: crossfilter.
    const catTop=await docY(page.getByTestId('panel-category'));
    await scrollTo(catTop-300,0.9,'scroll to category bars');
    const bikes=await center(page.getByRole('button',{name:/^Bikes:/}));
    await glide({x:bikes.x,y:bikes.box.y+bikes.box.height*0.3},1.0,'cursor to Bikes bar');
    await hold(0.7,'hover tooltip');
    caption('Click to crossfilter','Every visual re-aggregates 120,000 orders');
    await click('click Bikes');
    await glide({x:bikes.x+140,y:bikes.box.y-40},0.6);
    await hold(0.9,'crossfilter transition');
    await still('02-crossfilter','Bikes selected: every visual re-aggregates');
    await hold(0.6);
    // Brush the canvas scatter.
    const scatterTop=await docY(page.getByTestId('panel-scatter'));
    await scrollTo(scatterTop-150,0.9,'scroll to scatter');
    const surf=(await center(page.getByTestId('chart-scatter-surface'))).box,P=(x,y)=>({x:surf.x+surf.width*x,y:surf.y+surf.height*y});
    await glide(P(0.1,0.12),0.7,'cursor to scatter');
    caption('Brush 120,000 points on Canvas','The interval is a saved, shareable view field');
    await drag([P(0.1,0.12),P(0.24,0.3),P(0.36,0.5)],0.6,'brush');
    await hold(1.1,'brush applied');
    await still('03-brush','Canvas brush over 120,000 orders');
    await hold(0.4);
    // Switch to 3D.
    await scrollTo(0,0.8,'scroll to top');
    const tab=await center(page.getByTestId('tab-explorer-3d'));
    await glide(tab,0.7,'cursor to 3D tab');
    caption('Switch to 3D: same filters, same tokens','three.js loads lazily, only on this page');
    await click('open 3D explorer');
    await page.getByTestId('chart-cloud3d').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.viz3d-host canvas').length===3,null,{timeout:60000});
    await page.evaluate(()=>window.scrollTo(0,0));
    await hold(1.7,'3D columns grow');
    // Camera tour on the virtual clock.
    const tour=await center(page.getByTestId('tour-columns'));
    await glide(tour,0.6,'cursor to Tour');
    caption('Camera keyframes on the motion clock','Deterministic capture · reduced motion respected');
    await click('start camera tour');
    await glide({x:tour.x+60,y:tour.y+70},0.4);
    await hold(2.4,'tour');
    await still('04-tour','3D columns, camera tour on the virtual clock');
    await hold(3.4,'tour end');
    // Surface + wireframe.
    const wire=await center(page.getByTestId('toggle-wireframe'));
    await glide(wire,0.7,'cursor to wireframe');
    caption('Surface z = f(x, y)','Order density over margin × discount · brush highlighted');
    await click('wireframe on');
    const surfBox=(await center(page.getByTestId('chart-surface3d'))).box;
    await glide({x:surfBox.x+surfBox.width*0.6,y:surfBox.y+surfBox.height*0.42},0.8,'hover surface');
    await hold(1.0,'surface hover');
    await still('05-surface','Density surface (wireframe), brush highlighted');
    await hold(0.3);
    // Point cloud: clear the brush, orbit, lasso.
    const cloudTop=await docY(page.getByTestId('panel-cloud'));
    await scrollTo(cloudTop-96,0.9,'scroll to cloud');
    const clear=await center(page.getByRole('button',{name:'Clear brush'}));
    await glide(clear,0.6,'cursor to Clear');
    caption('120,000 points in WebGL','Coloured by category · drag to orbit');
    await click('clear brush');
    const cloud=(await center(page.getByTestId('chart-cloud3d'))).box,C=(x,y)=>({x:cloud.x+cloud.width*x,y:cloud.y+cloud.height*y});
    await glide(C(0.56,0.62),0.6,'cursor to cloud');
    await drag([C(0.56,0.62),C(0.52,0.61)],0.8,'orbit drag');
    const lassoBtn=await center(page.getByTestId('mode-lasso'));
    await glide(lassoBtn,0.6,'cursor to Lasso');
    await click('lasso mode');
    const L=[[0.33,0.3],[0.48,0.24],[0.58,0.34],[0.55,0.52],[0.42,0.58],[0.31,0.48],[0.33,0.3]].map(([x,y])=>C(x,y));
    await glide(L[0],0.5,'cursor to lasso start');
    caption('Lasso in screen space','The 3D selection becomes the shared brush');
    await drag(L,0.25,'lasso');
    await hold(1.0,'lasso applied');
    await still('06-lasso','Lasso on the 120,000-point cloud writes the shared brush');
    await hold(0.5);
    // Back to 2D: the lasso is the brush.
    await scrollTo(0,0.7,'scroll to top');
    const overview=await center(page.getByTestId('tab-dashboard'));
    await glide(overview,0.6,'cursor to Overview');
    caption('Back in 2D, nothing lost','DataPass viz kit · one crossfilter for 2D and 3D');
    await click('back to 2D');
    await page.getByTestId('chart-scatter').waitFor();
    await hold(1.4,'2D shows the lasso brush');
    state.visible=false;hideCaption();await hold(0.9,'end');
    captionsOut=captions.map(c=>({title:c.title,sub:c.sub,from:+(c.from/FPS).toFixed(2),to:+((c.to??frame)/FPS).toFixed(2)}));
    if(errors.length)throw new Error('Page errors: '+errors.join('; '));
    await context.close();
  }finally{ff.stdin.end();await browser.close();server.kill();}
  await ffDone;
  // Stills: downscale the 1.5x screenshots to 1280x720.
  for(const s of stills){const out=path.join(OUT,s.name+'.png');const r=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-y','-i',s.file,'-vf',`scale=${W}:${H}:flags=lanczos`,out]);if(r.status!==0)throw new Error('still failed');s.file=path.relative(process.cwd(),out).replace(/\\/g,'/');s.sha256=sha(await readFile(out));}
  await rm(tmp,{recursive:true,force:true});
  const check=await checkFrames(video);
  const info=await stat(video),bytes=info.size;
  const meta={format:'datapass.viz-gallery-video',version:1,client:id,synthetic:true,
    video:{file:path.relative(process.cwd(),video).replace(/\\/g,'/'),width:W,height:H,fps:FPS,frames:frame,seconds:+(frame/FPS).toFixed(2),codec:'h264 (libx264, crf 22, yuv420p)',bytes,sha256:sha(await readFile(video)),committed:bytes<5*1024*1024},
    capture:{method:'Playwright screenshot per frame at deviceScaleFactor '+SCALE+', downscaled with lanczos; page tweens on one VirtualClock advanced by 1/'+FPS+' s per frame (?record=1)',ffmpeg:version.stdout.split('\n')[0]},
    frameCheck:check,captions:captionsOut,timeline,stills:stills.map(({name,label,frame,t,file,sha256})=>({name,label,frame,t,file,sha256}))};
  await writeFile(path.join(OUT,'metadata.json'),JSON.stringify(meta,null,2)+'\n');
  console.log(`Recorded ${frame} frames (${meta.video.seconds} s), ${(bytes/1048576).toFixed(2)} MB, frame check ${check.status} (${check.blends.length} blends, ${check.flashes.length} flashes).`);
  if(check.status!=='passed')process.exitCode=1;
}

/** Decode the video at 160x90 gray and look for crossfade double exposure (a middle frame that
 * is the average of two different neighbours across a large change) and single-frame flashes. */
async function checkFrames(video){
  const w=160,h=90,r=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-i',video,'-vf',`scale=${w}:${h},format=gray`,'-f','rawvideo','-'],{maxBuffer:1<<30});
  if(r.status!==0)throw new Error('frame decode failed');
  const buf=r.stdout,size=w*h,n=Math.floor(buf.length/size),f=i=>buf.subarray(i*size,(i+1)*size);
  const mad=(a,b)=>{let s=0;for(let i=0;i<size;i++)s+=Math.abs(a[i]-b[i]);return s/size;};
  const blends=[],flashes=[];let maxStep=0;
  for(let i=1;i<n-1;i++){
    const a=f(i-1),b=f(i),c=f(i+1),ac=mad(a,c),ab=mad(a,b),bc=mad(b,c);maxStep=Math.max(maxStep,ab);
    if(ac>6){let mid=0;for(let k=0;k<size;k++)mid+=Math.abs(b[k]-(a[k]+c[k])/2);mid/=size;if(mid<ac*0.18&&ab>ac*0.3&&bc>ac*0.3)blends.push({frame:i,ac:+ac.toFixed(2),mid:+mid.toFixed(2)});}
    if(ab>12&&bc>12&&ac<Math.min(ab,bc)*0.3)flashes.push({frame:i,ab:+ab.toFixed(2),bc:+bc.toFixed(2),ac:+ac.toFixed(2)});
  }
  return {frames:n,size:`${w}x${h} gray`,maxConsecutiveMeanAbsDiff:+maxStep.toFixed(2),blends,flashes,status:blends.length||flashes.length?'failed':'passed',
    rule:'blend: |b-(a+c)/2| < 0.18·|a-c| with |a-c| > 6 and b distinct from both; flash: b differs >12 from both neighbours that agree'};
}
await main();
