/** Static 2D export of the current graph view. Theme variables are resolved to concrete colours so the
 * file renders anywhere; nothing leaves the browser (a local download only). */
const PAINT=['fill','stroke','stroke-width','stroke-opacity','fill-opacity','stroke-dasharray'] as const;
const TEXT=['font-size','font-weight','paint-order'] as const;
const GRAPHIC=new Set(['path','circle','rect','line','text','ellipse','polygon','polyline']);

/** Clone the live SVG with computed paint inlined, the current viewBox, a background and a caption. */
export function standaloneSvg(svg:SVGSVGElement,caption:string):string{
  const clone=svg.cloneNode(true) as SVGSVGElement;
  const src=[svg,...svg.querySelectorAll('*')],dst=[clone,...clone.querySelectorAll('*')];
  src.forEach((el,i)=>{
    const out=dst[i] as SVGElement|undefined;if(!out)return;
    const tag=el.tagName.toLowerCase();
    if(GRAPHIC.has(tag)){
      const cs=getComputedStyle(el);
      for(const p of PAINT){const value=cs.getPropertyValue(p);if(value)out.setAttribute(p,value);}
      if(tag==='text')for(const p of TEXT){const value=cs.getPropertyValue(p);if(value&&value!=='normal')out.setAttribute(p,value);}
    }
    out.removeAttribute('class');out.removeAttribute('style');out.removeAttribute('tabindex');out.removeAttribute('role');
    for(const a of [...out.attributes])if(a.name.startsWith('data-')||a.name.startsWith('aria-'))out.removeAttribute(a.name);
  });
  const [x,y,w,h]=(svg.getAttribute('viewBox')||'0 0 1100 760').split(/\s+/).map(Number) as [number,number,number,number];
  const pad=h*0.06,ink=getComputedStyle(svg).getPropertyValue('--dp-viz-ink-muted').trim()||'#616161';
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('font-family',getComputedStyle(svg).getPropertyValue('font-family')||'system-ui, sans-serif');
  clone.setAttribute('viewBox',`${x} ${y} ${w} ${h+pad}`);
  clone.setAttribute('width',String(Math.round(w*1.2)));clone.setAttribute('height',String(Math.round((h+pad)*1.2)));
  const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('x',String(x));bg.setAttribute('y',String(y));bg.setAttribute('width',String(w));bg.setAttribute('height',String(h+pad));
  bg.setAttribute('fill',getComputedStyle(svg).getPropertyValue('--dp-viz-surface').trim()||'#ffffff');clone.insertBefore(bg,clone.firstChild);
  const note=document.createElementNS('http://www.w3.org/2000/svg','text');
  note.setAttribute('x',String(x+w*0.015));note.setAttribute('y',String(y+h+pad*0.65));note.setAttribute('fill',ink);
  note.setAttribute('font-family','Segoe UI, system-ui, sans-serif');note.setAttribute('font-size',String(Math.max(8,h*0.022)));
  note.textContent=caption;clone.appendChild(note);
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
}

function download(blob:Blob,file:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=file;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportSvg(svg:SVGSVGElement,name:string,caption:string){
  download(new Blob([standaloneSvg(svg,caption)],{type:'image/svg+xml'}),name+'.svg');
}
/** Rasterise the standalone SVG at 2x through an image + canvas (CSP allows blob: images). */
export async function exportPng(svg:SVGSVGElement,name:string,caption:string){
  const text=standaloneSvg(svg,caption),url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));
  try{
    const img=new Image();img.decoding='sync';img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth*2;canvas.height=img.naturalHeight*2;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No 2D canvas');
    ctx.scale(2,2);ctx.drawImage(img,0,0);
    const blob=await new Promise<Blob>((ok,fail)=>canvas.toBlob(b=>b?ok(b):fail(new Error('PNG encoding failed')),'image/png'));
    download(blob,name+'.png');
  }finally{URL.revokeObjectURL(url);}
}

/** A ready-made standalone SVG document (the isometric export already carries its colours and background). */
export function exportSvgText(text:string,name:string){
  download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n'+text],{type:'image/svg+xml'}),name+'.svg');
}
export async function exportPngText(text:string,name:string,width=2400){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
  const [,,w,h]=(doc.getAttribute('viewBox')||'0 0 1600 1000').split(/\s+/).map(Number) as [number,number,number,number];
  doc.setAttribute('width',String(width));doc.setAttribute('height',String(Math.round(width*h/w)));
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)],{type:'image/svg+xml'}));
  try{
    const img=new Image();img.decoding='sync';img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No 2D canvas');ctx.drawImage(img,0,0);
    const blob=await new Promise<Blob>((ok,fail)=>canvas.toBlob(b=>b?ok(b):fail(new Error('PNG encoding failed')),'image/png'));
    download(blob,name+'.png');
  }finally{URL.revokeObjectURL(url);}
}
