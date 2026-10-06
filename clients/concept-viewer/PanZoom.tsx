import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Maximize2,Minus,Plus} from 'lucide-react';

/** Smallest on-screen size (CSS px) of a node label at the starting zoom. */
export const MIN_LABEL_PX=11;
const PAD=18,MAX_ZOOM=4,KEEP=80;
type View={k:number;x:number;y:number};
const VIEWBOX=/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/;
const viewBoxOf=(attr:string)=>{const m=VIEWBOX.exec(attr);return m?{w:Number(m[3]),h:Number(m[4])}:null;};

/**
 * Pan/zoom stage for a static SVG string (isometric view). The SVG is laid out at its viewBox size (1 unit = 1 CSS px)
 * and scaled with a CSS transform, so the markup and the exported file stay full size.
 * Start: fit to the stage width, zoomed in further when needed so the smallest node label is >= MIN_LABEL_PX on screen.
 * Wheel zooms around the pointer, drag pans (a drag never counts as a click), "Fit" returns to the stage width.
 */
export function PanZoom({svg,resetKey,testId,onClick}:{svg:string;resetKey:string;testId:string;onClick:(e:React.MouseEvent)=>void}){
  const host=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
  // Keyed on the viewBox text: a new selection re-renders the markup but must not reset the view.
  const vbText=VIEWBOX.exec(svg)?.[0]??'',box=useMemo(()=>viewBoxOf(vbText),[vbText]);
  const sized=useMemo(()=>box?svg.replace(/^<svg /,`<svg width="${box.w}" height="${box.h}" `):svg,[svg,box]);
  const [view,setView]=useState<View|null>(null),[fitK,setFitK]=useState(1),[labelFont,setLabelFont]=useState(0);
  const touched=useRef(false),drag=useRef<{id:number;x:number;y:number;vx:number;vy:number;moved:boolean}|null>(null),suppress=useRef(false);
  const viewRef=useRef(view);viewRef.current=view;

  const size=()=>{const r=host.current?.getBoundingClientRect();return {cw:r?.width??0,ch:r?.height??0};};
  /** Keep at least KEEP px of the diagram inside the stage; a diagram narrower than the stage is centred horizontally. */
  const clamp=useCallback((v:View):View=>{
    if(!box)return v;const {cw,ch}=size(),w=box.w*v.k,h=box.h*v.k;
    const x=w<=cw-2*PAD?(cw-w)/2:Math.min(cw-KEEP,Math.max(KEEP-w,v.x));
    const y=Math.min(ch-KEEP,Math.max(KEEP-h,v.y));
    return {k:v.k,x,y};
  },[box]);
  const fit=useCallback((readable:boolean)=>{
    if(!box||!content.current)return;const {cw}=size();if(!cw)return;
    const fonts=[...content.current.querySelectorAll('[data-entity] text,[data-node] text')].map(t=>Number(t.getAttribute('font-size'))).filter(n=>n>0);
    const font=fonts.length?Math.min(...fonts):0,k=(cw-2*PAD)/box.w;
    setFitK(k);setLabelFont(font);
    const start=readable&&font?Math.max(k,MIN_LABEL_PX/font):k;
    // Wider than the stage: start at the left edge, where the title and the layer labels are.
    setView(clamp({k:start,x:PAD,y:PAD}));
  },[box,clamp]);
  // New spec or new stage size (until the reader pans or zooms): fit to width at a readable zoom.
  useLayoutEffect(()=>{touched.current=false;fit(true);},[resetKey,box?.w,box?.h,fit]);
  useEffect(()=>{
    const el=host.current;if(!el)return;
    const ro=new ResizeObserver(()=>{if(!touched.current)fit(true);else setView(v=>v&&clamp(v));});ro.observe(el);
    return()=>ro.disconnect();
  },[fit,clamp]);
  const zoomAt=useCallback((factor:number,px?:number,py?:number)=>{
    setView(v=>{if(!v)return v;const {cw,ch}=size(),cx=px??cw/2,cy=py??ch/2,minK=Math.min(fitK,1)*.5;
      const k=Math.min(MAX_ZOOM,Math.max(minK,v.k*factor)),r=k/v.k;
      return clamp({k,x:cx-(cx-v.x)*r,y:cy-(cy-v.y)*r});});
    touched.current=true;
  },[fitK,clamp]);
  // Wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(()=>{
    const el=host.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0015)),e.clientX-r.left,e.clientY-r.top);};
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[zoomAt]);
  const down=(e:React.PointerEvent)=>{if(e.button!==0||!viewRef.current||(e.target as Element).closest('.cv-pz-tools'))return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,vx:viewRef.current.x,vy:viewRef.current.y,moved:false};};
  const move=(e:React.PointerEvent)=>{
    const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.moved&&Math.hypot(dx,dy)<4)return;
    if(!d.moved){d.moved=true;host.current?.setPointerCapture(e.pointerId);host.current?.classList.add('dragging');}
    touched.current=true;setView(v=>v&&clamp({k:v.k,x:d.vx+dx,y:d.vy+dy}));
  };
  const up=(e:React.PointerEvent)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;host.current?.classList.remove('dragging');
    if(d.moved){suppress.current=true;setTimeout(()=>{suppress.current=false;},0);}};
  const k=view?.k??1;
  return <div ref={host} className="aa-svg cv-pz" data-testid={testId} data-zoom={k.toFixed(3)} data-fit-zoom={fitK.toFixed(3)} data-label-px={(labelFont*k).toFixed(2)}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    onClickCapture={e=>{if(suppress.current){e.stopPropagation();e.preventDefault();suppress.current=false;}}} onClick={onClick}>
    <div ref={content} className="cv-pz-content" style={{transform:view?`translate(${view.x}px,${view.y}px) scale(${view.k})`:undefined,visibility:view?'visible':'hidden'}} dangerouslySetInnerHTML={{__html:sized}}/>
    <div className="cv-pz-tools" role="group" aria-label="Zoom">
      <button onClick={()=>zoomAt(1/1.25)} aria-label="Zoom out" title="Zoom out"><Minus size={13}/></button>
      <output aria-live="polite">{Math.round(k*100)}%</output>
      <button onClick={()=>zoomAt(1.25)} aria-label="Zoom in" title="Zoom in"><Plus size={13}/></button>
      <button onClick={()=>{touched.current=false;fit(false);}} aria-label="Fit to width" title="Fit the diagram to the stage width"><Maximize2 size={12}/> Fit</button>
    </div>
  </div>;
}
