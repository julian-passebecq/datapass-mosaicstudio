/** Untrusted notebook output → inert render items (FR-03). Pure: no DOM, no evaluation.
 * Kernel outputs and imported .ipynb outputs are data. HTML and SVG are shown as source text, script MIME
 * types are refused, raster images are shown only from validated base64, and every other MIME type is
 * listed as preserved-but-not-displayed (it stays in exports). Nothing here trusts a notebook signature. */
import {stripAnsi} from './jupyter.ts';

export type RenderItem=
  |{kind:'text';stream:'stdout'|'stderr'|'result';text:string}
  |{kind:'image';mime:'image/png'|'image/jpeg'|'image/gif';src:string}
  |{kind:'markup-as-text';mime:string;text:string}
  |{kind:'error';ename:string;evalue:string;traceback:string}
  |{kind:'refused';mime:string}
  |{kind:'unsupported';mimes:string[]};

const IMAGES=['image/png','image/jpeg','image/gif'] as const;
const TEXTUAL=['text/plain','text/markdown','text/latex','application/json'];
const MARKUP=['text/html','image/svg+xml'];
const B64=/^[A-Za-z0-9+/\s]+={0,2}\s*$/;
const TEXT_LIMIT=200000;
function isScript(mime:string):boolean{return /javascript|ecmascript|widget-view|vnd\.jupyter\.widget|bokehjs|plotly\.v1\+json|vnd\.vega/i.test(mime);}
function textOf(v:unknown):string{const s=Array.isArray(v)?v.map(String).join(''):typeof v==='string'?v:JSON.stringify(v,null,1)??'';return s.length>TEXT_LIMIT?s.slice(0,TEXT_LIMIT)+'\n[DataPass] text truncated for display.':s;}

export function renderOutput(output:unknown):RenderItem[]{
  if(!output||typeof output!=='object'||Array.isArray(output))return [{kind:'unsupported',mimes:['(malformed output)']}];
  const o=output as Record<string,unknown>;
  if(o.output_type==='stream')return [{kind:'text',stream:o.name==='stderr'?'stderr':'stdout',text:stripAnsi(textOf(o.text))}];
  if(o.output_type==='error')return [{kind:'error',ename:String(o.ename??'Error').slice(0,200),evalue:stripAnsi(String(o.evalue??'')).slice(0,2000),traceback:stripAnsi(Array.isArray(o.traceback)?o.traceback.map(String).join('\n'):'').slice(0,TEXT_LIMIT)}];
  if((o.output_type==='display_data'||o.output_type==='execute_result')&&o.data&&typeof o.data==='object'&&!Array.isArray(o.data)){
    const data=o.data as Record<string,unknown>,mimes=Object.keys(data),items:RenderItem[]=[];
    const image=IMAGES.find(m=>typeof data[m]==='string'&&B64.test(data[m] as string)&&(data[m] as string).length<=2_100_000);
    const text=TEXTUAL.find(m=>m in data);
    if(image)items.push({kind:'image',mime:image,src:`data:${image};base64,${(data[image] as string).replace(/\s+/g,'')}`});
    else if(text)items.push({kind:'text',stream:'result',text:stripAnsi(textOf(data[text]))});
    else{const markup=MARKUP.find(m=>m in data);if(markup)items.push({kind:'markup-as-text',mime:markup,text:textOf(data[markup])});}
    for(const m of mimes)if(isScript(m))items.push({kind:'refused',mime:m.slice(0,80)});
    const shown=new Set<string>([...(image?[image]:[]),...(text?[text]:[])]);
    const rest=mimes.filter(m=>!shown.has(m)&&!isScript(m)&&!(items.some(i=>i.kind==='markup-as-text'&&i.mime===m)));
    if(rest.length)items.push({kind:'unsupported',mimes:rest.slice(0,12).map(m=>m.slice(0,80))});
    return items.length?items:[{kind:'unsupported',mimes:['(empty output)']}];
  }
  return [{kind:'unsupported',mimes:[String(o.output_type??'(unknown output type)').slice(0,80)]}];
}
export function renderOutputs(outputs:readonly unknown[]):RenderItem[]{return outputs.slice(0,200).flatMap(renderOutput);}
