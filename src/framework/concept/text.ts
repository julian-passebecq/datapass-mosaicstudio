/**
 * Deterministic text measurement for static SVG layout (no DOM). Widths are deliberately generous estimates
 * for Inter / Segoe UI / system sans fonts, so a label that fits here fits in the browser; the browser test
 * measures the real glyph boxes to prove it.
 */
const NARROW=new Set([...'ijlt.,:;\'|!()[]/ ']);
const WIDE=new Set([...'mwMW@%']);
export function textWidth(text:string,size:number,{bold=false,letterSpacing=0}:{bold?:boolean;letterSpacing?:number}={}):number{
  let w=0;
  for(const ch of text){
    const k=ch===' '?.3:NARROW.has(ch)?.34:WIDE.has(ch)?.9:/[A-Z0-9]/.test(ch)?.7:/[a-z]/.test(ch)?.57:.72;
    w+=k*size+letterSpacing;
  }
  return w*(bold?1.07:1);
}
/** Greedy word wrap at `maxWidth`; words longer than a line are split. */
export function wrapText(text:string,maxWidth:number,size:number,opts:{bold?:boolean;letterSpacing?:number}={}):string[]{
  const fits=(s:string)=>textWidth(s,size,opts)<=maxWidth;
  const words=text.trim().split(/\s+/).flatMap(word=>{
    if(fits(word))return [word];
    const parts:string[]=[];let cur='';
    for(const ch of word){if(cur&&!fits(cur+ch)){parts.push(cur);cur=ch;}else cur+=ch;}
    if(cur)parts.push(cur);return parts;
  });
  const lines=[''];
  for(const w of words){const i=lines.length-1;if(lines[i]&&!fits(lines[i]+' '+w))lines.push(w);else lines[i]+=(lines[i]?' ':'')+w;}
  return lines;
}
/** Largest size in [min, size] (0.5 px steps) whose wrap fits in `maxLines`; at `min` it may use more lines. */
export function fitText(text:string,maxWidth:number,size:number,min:number,maxLines:number,opts:{bold?:boolean;letterSpacing?:number}={}):{size:number;lines:string[]}{
  for(let s=size;s>=min-1e-9;s-=.5){const lines=wrapText(text,maxWidth,s,opts);if(lines.length<=maxLines)return {size:s,lines};}
  return {size:min,lines:wrapText(text,maxWidth,min,opts)};
}
