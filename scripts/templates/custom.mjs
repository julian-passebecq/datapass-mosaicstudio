/** Client-owned example, not a new framework renderer or business model. */
export const customFields=[
  {id:'custom-selection',label:'Selected semantic object',role:'view',type:'select',default:'none',options:[{value:'none',label:'None'},{value:'alpha',label:'Alpha'},{value:'beta',label:'Beta'}]},
  {id:'custom-representation',label:'Custom representation',role:'view',type:'select',default:'svg',options:[{value:'svg',label:'SVG'},{value:'canvas',label:'Canvas'}]},
  {id:'custom-show-alpha',label:'Show Alpha in the visual',role:'view',type:'toggle',default:true},
];
export const customSource=`import {useEffect,useRef,useState} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {useElementSize,useSelection} from '../../src/framework/visual';
import {ContextInspector} from '../../src/framework/foundation/ContextInspector';
const objects=[{id:'alpha',label:'Alpha',x:180},{id:'beta',label:'Beta',x:420}];
export function ClientNote(){
  const runtime=useRuntime(),state=useSiteState(),{selected,select}=useSelection('custom-selection');
  const {ref,width,height,ready}=useElementSize(),canvas=useRef<HTMLCanvasElement>(null),[canvasError,setCanvasError]=useState(false);
  const mode=String(state.values['custom-representation']),showAlpha=Boolean(state.values['custom-show-alpha']);
  const visible=objects.filter(object=>showAlpha||object.id!=='alpha');
  useEffect(()=>{
    const node=canvas.current;if(!node||mode!=='canvas'||!ready)return;
    const ratio=Math.min(devicePixelRatio||1,2);node.width=Math.round(width*ratio);node.height=Math.round(height*ratio);
    const ctx=node.getContext('2d');setCanvasError(!ctx);if(!ctx)return;
    const scale=Math.min(width/600,height/250),ox=(width-600*scale)/2,oy=(height-250*scale)/2;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,node.width,node.height);
    ctx.setTransform(scale*ratio,0,0,scale*ratio,ox*ratio,oy*ratio);
    for(const object of objects.filter(object=>showAlpha||object.id!=='alpha')){
      ctx.beginPath();ctx.arc(object.x,110,46,0,Math.PI*2);ctx.fillStyle=object.id===selected?'#286f89':'#e6eef2';ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#286f89';ctx.stroke();ctx.fillStyle='#20374a';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText(object.label,object.x,184);
    }
    // The bitmap is derived from view state. No timers, external assets or global DOM mutation.
    return()=>{ctx.clearRect(0,0,600,250);};
  },[mode,width,height,ready,selected,showAlpha]);
  return <section className="site-text" data-custom-visual data-capture-state={mode==='canvas'&&canvasError?'error':ready?'ready':'busy'}>
    <h2>Client-owned component</h2><p>Synthetic SVG and Canvas projections of the same semantic objects. No business computation is triggered by selection.</p>
    <div role="group" aria-label="Custom representation">{['svg','canvas'].map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>runtime.applyCue({'custom-representation':value})}>{value==='svg'?'SVG view':'Canvas view'}</button>)} <button type="button" onClick={()=>runtime.applyCue({'custom-show-alpha':!showAlpha})}>{showAlpha?'Hide Alpha':'Show Alpha'}</button></div>
    <div ref={ref} style={{height:250,width:'100%',minWidth:0}} data-visual-size={Math.round(width)+'x'+Math.round(height)}>
      {mode==='svg'?<svg viewBox="0 0 600 250" width="100%" height="100%" role="group" aria-label="Semantic SVG projection">{visible.map(object=><g key={object.id} role="button" tabIndex={0} aria-label={'Select '+object.label+' in SVG'} aria-pressed={selected===object.id} onClick={()=>select(object.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(object.id);}}} style={{cursor:'pointer'}}><circle cx={object.x} cy={110} r={46} fill={selected===object.id?'var(--site-accent)':'#e6eef2'} stroke="var(--site-accent)" strokeWidth={2}/><text x={object.x} y={184} textAnchor="middle" fill="currentColor">{object.label}</text></g>)}</svg>:<canvas ref={canvas} style={{width:'100%',height:'100%'}} role="img" aria-label={'Canvas projection; selected '+selected+'. Use the semantic object buttons below.'} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/600,rect.height/250),x=(event.clientX-rect.left-(rect.width-600*scale)/2)/scale,y=(event.clientY-rect.top-(rect.height-250*scale)/2)/scale;const hit=visible.find(object=>Math.hypot(x-object.x,y-110)<=46);if(hit)select(hit.id);}}/>}
    </div>
    {mode==='canvas'&&canvasError&&<p role="alert">Canvas is unavailable. Use SVG or the semantic object buttons.</p>}
    <div role="group" aria-label="Semantic objects">{objects.map(object=><button type="button" key={object.id} aria-pressed={selected===object.id} onClick={()=>select(object.id)}>{object.label}</button>)} <button type="button" onClick={()=>select('none')}>Clear selection</button></div>
    {selected==='alpha'&&!showAlpha&&<p role="status">Selected Alpha is hidden in this projection; its semantic identity is retained.</p>}
    <ContextInspector model={{id:selected,kind:'Synthetic example',title:objects.find(object=>object.id===selected)?.label||'No selection',summary:'Client-owned content; generic context presentation.',facts:[{label:'Semantic ID',value:selected},{label:'Representation',value:mode}],references:[],related:objects.filter(object=>object.id!==selected).map(object=>({id:object.id,label:object.label})),note:'Illustrative objects, not measurements or live execution.'}} onRelated={select}/>
  </section>;
}
`;
