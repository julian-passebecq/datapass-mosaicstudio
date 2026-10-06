/** One shared tooltip per viz tree. Charts push content imperatively, so hovering never
 * re-renders a chart. Rendered inside VizRoot so it inherits the theme variables.
 */
import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
export type TooltipRow={label:string;value:string;color?:string};
export type TooltipContent={x:number;y:number;title:string;rows:TooltipRow[]};
export type TooltipApi={show(content:TooltipContent):void;hide():void};
class TooltipStore implements TooltipApi {
  content:TooltipContent|null=null;private listeners=new Set<()=>void>();
  show(content:TooltipContent){this.content=content;this.listeners.forEach(l=>l());}
  hide(){if(!this.content)return;this.content=null;this.listeners.forEach(l=>l());}
  subscribe(l:()=>void){this.listeners.add(l);return()=>{this.listeners.delete(l);};}
}
const TooltipContext=createContext<TooltipStore|null>(null);
export function TooltipProvider({children}:{children:React.ReactNode}){
  const store=useMemo(()=>new TooltipStore(),[]);
  return <TooltipContext.Provider value={store}>{children}<TooltipLayer store={store}/></TooltipContext.Provider>;
}
const noop:TooltipApi={show(){},hide(){}};
export function useTooltip():TooltipApi{return useContext(TooltipContext)||noop;}
function TooltipLayer({store}:{store:TooltipStore}){
  const [content,setContent]=useState<TooltipContent|null>(null),ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:180,h:60});
  useEffect(()=>store.subscribe(()=>setContent(store.content)),[store]);
  useEffect(()=>{const el=ref.current;if(el){const r=el.getBoundingClientRect();if(Math.abs(r.width-size.w)>1||Math.abs(r.height-size.h)>1)setSize({w:r.width,h:r.height});}});
  if(!content)return null;
  const vw=typeof innerWidth==='number'?innerWidth:1440,vh=typeof innerHeight==='number'?innerHeight:900;
  let left=content.x+14,top=content.y+14;
  if(left+size.w>vw-8)left=content.x-14-size.w;
  if(top+size.h>vh-8)top=content.y-14-size.h;
  return <div ref={ref} className="viz-tooltip" role="tooltip" data-testid="viz-tooltip" style={{left:Math.max(8,left),top:Math.max(8,top)}}>
    <strong>{content.title}</strong>
    <dl>{content.rows.map((row,i)=><div key={i} style={{display:'contents'}}><dt>{row.color&&<i style={{background:row.color}}/>}{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
  </div>;
}
