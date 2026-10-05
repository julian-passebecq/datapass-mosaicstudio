/** Viz motion: one duration scale, Fluent-like curves and a swappable clock.
 * Real clock = requestAnimationFrame. Virtual clock = deterministic time that only moves when
 * advanced (tests) or settles every tween at once (capture). Reduced motion and capture both
 * collapse durations to 0, so no tween is ever scheduled. Pure module: no React, no DOM import.
 */
export const DURATIONS=Object.freeze({fast:150,normal:250,slow:400});
export type DurationName=keyof typeof DURATIONS;
type Bezier=readonly [number,number,number,number];
/** Fluent 2 motion curves (cubic-bezier control points). */
export const CURVES=Object.freeze({
  decelerate:[0.1,0.9,0.2,1] as Bezier,
  accelerate:[0.9,0.1,1,0.2] as Bezier,
  standard:[0.33,0,0.67,1] as Bezier,
  linear:[0,0,1,1] as Bezier,
});
export type CurveName=keyof typeof CURVES;

/** Solve a CSS cubic-bezier for x=t (Newton + bisection fallback). Exact at 0 and 1. */
export function cubicBezier([x1,y1,x2,y2]:Bezier):(t:number)=>number{
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const sx=(u:number)=>((ax*u+bx)*u+cx)*u,sy=(u:number)=>((ay*u+by)*u+cy)*u,dx=(u:number)=>(3*ax*u+2*bx)*u+cx;
  return t=>{
    if(t<=0)return 0;if(t>=1)return 1;
    let u=t;
    for(let i=0;i<8;i++){const err=sx(u)-t;if(Math.abs(err)<1e-6)return sy(u);const d=dx(u);if(Math.abs(d)<1e-6)break;u-=err/d;}
    let lo=0,hi=1;u=t;
    for(let i=0;i<30;i++){const x=sx(u);if(Math.abs(x-t)<1e-6)break;if(x<t)lo=u;else hi=u;u=(lo+hi)/2;}
    return sy(u);
  };
}
const easings=new Map<CurveName,(t:number)=>number>();
export function ease(name:CurveName):(t:number)=>number{let f=easings.get(name);if(!f){f=cubicBezier(CURVES[name]);easings.set(name,f);}return f;}

export interface Clock {readonly kind:'real'|'virtual';now():number;request(callback:(now:number)=>void):number;cancel(id:number):void}
export function realClock():Clock{
  const raf=globalThis.requestAnimationFrame?.bind(globalThis),caf=globalThis.cancelAnimationFrame?.bind(globalThis);
  if(!raf||!caf)return new VirtualClock();
  return {kind:'real',now:()=>performance.now(),request:raf,cancel:caf};
}
/** Deterministic clock. Time moves only through advance(); frames are fixed 16 ms steps. */
export class VirtualClock implements Clock {
  readonly kind='virtual';private time=0;private next=1;private queue=new Map<number,(now:number)=>void>();
  now(){return this.time;}
  request(callback:(now:number)=>void){const id=this.next++;this.queue.set(id,callback);return id;}
  cancel(id:number){this.queue.delete(id);}
  get pending(){return this.queue.size;}
  /** Run frames of `step` ms until `ms` elapsed. */
  advance(ms:number,step=16){
    if(!(ms>=0)||!(step>0))throw new Error('Virtual clock advance needs a non-negative duration');
    const end=this.time+ms;
    while(this.time<end){this.time=Math.min(end,this.time+step);this.flush();}
  }
  /** Advance until no frame is queued (bounded so a runaway loop cannot hang a capture). */
  settle(maxMs=10000){let spent=0;while(this.queue.size&&spent<maxMs){this.advance(16);spent+=16;}if(this.queue.size)throw new Error('Virtual clock did not settle');}
  private flush(){const batch=[...this.queue];this.queue.clear();for(const[,callback]of batch)callback(this.time);}
}

export type MotionOptions={reduced?:boolean;capture?:boolean;clock?:Clock};
export type Tween={cancel():void;readonly done:boolean};
/** The motion controller a chart tree shares. It counts active tweens for the settled signal. */
export class Motion {
  readonly clock:Clock;readonly reduced:boolean;readonly capture:boolean;
  private active=0;private listeners=new Set<(settled:boolean)=>void>();
  constructor(options:MotionOptions={}){this.reduced=!!options.reduced;this.capture=!!options.capture;this.clock=options.clock||realClock();}
  /** Effective duration in ms: 0 under reduced motion or capture. */
  duration(value:DurationName|number='normal'):number{
    if(this.reduced||this.capture)return 0;
    const ms=typeof value==='number'?value:DURATIONS[value];
    return Math.max(0,Math.min(2000,ms));
  }
  get settled(){return this.active===0;}
  subscribe(listener:(settled:boolean)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private emit(){const settled=this.settled;for(const listener of [...this.listeners])listener(settled);}
  /** Run onFrame(eased progress 0..1). A zero duration calls onFrame(1) synchronously. */
  tween(options:{duration?:DurationName|number;curve?:CurveName;onFrame:(t:number)=>void;onDone?:()=>void}):Tween{
    const ms=this.duration(options.duration??'normal'),f=ease(options.curve||'decelerate');
    let done=false,id=0;
    const finish=()=>{if(done)return;done=true;options.onFrame(1);options.onDone?.();};
    if(ms===0){finish();return {cancel(){},get done(){return true;}};}
    this.active++;this.emit();
    const start=this.clock.now();
    const release=()=>{this.active--;this.emit();};
    const frame=(now:number)=>{
      if(done)return;
      const linear=Math.min(1,(now-start)/ms);
      if(linear>=1){finish();release();return;}
      options.onFrame(f(linear));id=this.clock.request(frame);
    };
    options.onFrame(0);id=this.clock.request(frame);
    return {cancel:()=>{if(done)return;done=true;this.clock.cancel(id);release();},get done(){return done;}};
  }
}
/** Capture mode: `?capture=1` or `data-capture` on <html>. Never inferred from user agents. */
export function detectCapture(location:{search:string}|undefined=globalThis.location,root:{dataset?:Record<string,string|undefined>}|undefined=globalThis.document?.documentElement):boolean{
  if(root?.dataset&&root.dataset.capture!==undefined&&root.dataset.capture!=='false')return true;
  if(!location)return false;
  const value=new URLSearchParams(location.search).get('capture');
  return value==='1'||value==='true';
}
export function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
