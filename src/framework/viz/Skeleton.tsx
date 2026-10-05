/** Loading placeholder shaped like the pending chart. Shimmer stops under reduced motion and capture. */
export function Skeleton({kind='bars',label='Loading chart'}:{kind?:'bars'|'line'|'kpi'|'donut'|'block';label?:string}){
  const bars=[0.55,0.8,0.42,0.95,0.68,0.5,0.74,0.36];
  return <div role="status" aria-label={label} aria-busy="true" data-viz-settled="false" data-testid="viz-skeleton" style={{height:'100%',display:'flex',alignItems:'flex-end',gap:8,padding:'8px 4px'}}>
    {kind==='bars'&&bars.map((h,i)=><div key={i} className="viz-skeleton" style={{flex:1,height:`${h*100}%`}}/>)}
    {kind==='line'&&<div className="viz-skeleton" style={{flex:1,height:'70%',clipPath:'polygon(0 70%,15% 52%,30% 60%,45% 30%,60% 42%,75% 18%,100% 26%,100% 100%,0 100%)'}}/>}
    {kind==='kpi'&&<div style={{display:'grid',gap:8,flex:1,alignSelf:'center'}}><div className="viz-skeleton" style={{height:10,width:'40%'}}/><div className="viz-skeleton" style={{height:26,width:'65%'}}/></div>}
    {kind==='donut'&&<div className="viz-skeleton" style={{aspectRatio:'1',height:'90%',margin:'auto',borderRadius:'50%',WebkitMask:'radial-gradient(circle,transparent 45%,black 46%)',mask:'radial-gradient(circle,transparent 45%,black 46%)'}}/>}
    {kind==='block'&&<div className="viz-skeleton" style={{flex:1,height:'100%'}}/>}
  </div>;
}
