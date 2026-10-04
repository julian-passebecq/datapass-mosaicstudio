import {getKit,type BrickPart} from './kits';
const project=([x,y,z]:number[])=>[320+(x-z)*25,225+(x+z)*10-y*34];
const points=(coords:number[][])=>coords.map(p=>project(p).join(',')).join(' ');
export function KitIllustration({kit,step=6,explode=0,selection='none',piece='none',isolate=false,onSelect}:{kit:string;step?:number;explode?:number;selection?:string;piece?:string;isolate?:boolean;onSelect?:(id:string)=>void}){
  const parts=getKit(kit).parts.filter(p=>p.step<=step).sort((a,b)=>(a.position[0]+a.position[2]+a.position[1]*8)-(b.position[0]+b.position[2]+b.position[1]*8));
  const draw=(p:BrickPart)=>{const [x,y0,z]=p.position,y=y0+(p.step-1)*.72*explode,dimensions=p.shape==='cylinder'?[Math.max(p.size[0],p.size[1])*2,p.size[2],Math.max(p.size[0],p.size[1])*2]:p.size,[w,h,d]=dimensions.map(s=>s/2);const top=[[x-w,y+h,z-d],[x+w,y+h,z-d],[x+w,y+h,z+d],[x-w,y+h,z+d]];
    return <g key={p.id} opacity={isolate&&selection!=='none'&&(piece!=='none'?piece!==p.id:selection!==p.lot)? .12:1} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?'Select '+p.name+' '+p.id:undefined} aria-pressed={onSelect?piece===p.id:undefined} onClick={()=>onSelect?.(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(p.id);}}} style={{cursor:onSelect?'pointer':'default'}}>
      <polygon points={points([[x-w,y-h,z+d],[x+w,y-h,z+d],[x+w,y+h,z+d],[x-w,y+h,z+d]])} fill={p.color}/>
      <polygon points={points([[x+w,y-h,z-d],[x+w,y-h,z+d],[x+w,y+h,z+d],[x+w,y+h,z-d]])} fill={p.color}/>
      <polygon points={points([[x+w,y-h,z-d],[x+w,y-h,z+d],[x+w,y+h,z+d],[x+w,y+h,z-d]])} fill="#000" opacity=".22"/>
      <polygon points={points(top)} fill={p.color} stroke="#ffffff" strokeOpacity=".25" strokeWidth=".6"/>
      {p.studs&&Array.from({length:p.studs[0]*p.studs[1]},(_,i)=>{const [nx,nz]=p.studs!;const [sx,sy]=project([x+(i%nx-(nx-1)/2)*p.size[0]/nx,y+h+.06,z+(Math.floor(i/nx)-(nz-1)/2)*p.size[2]/nz]);return <ellipse key={i} cx={sx} cy={sy} rx="3.8" ry="1.9" fill={p.color} stroke="#fff" strokeOpacity=".4"/>;})}
    </g>;};
  return <svg viewBox="0 0 640 390" className="fb-illustration" role={onSelect?'group':'img'} aria-label={getKit(kit).title+' synthetic brick model in 2D'}><ellipse cx="320" cy="283" rx="139" ry="23" fill="#000" opacity=".035"/>{parts.map(draw)}</svg>;
}
