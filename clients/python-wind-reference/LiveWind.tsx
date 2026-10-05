import {useState} from 'react';
import {ArtifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import type {ArtifactSourceSpec} from '../../src/framework/foundation/artifact-loader.ts';

/** Bridge level 3 (docs/PYTHON_BRIDGE.md): the domain inputs post to py/service/app.py; the static artifact is the fallback.
 * Level 2.5 ("Live file"): any producer rewrites artifacts/wind-aep-live-file.json (py/examples/live_slider.py); the dev server pushes the change. */
const STATIC:ArtifactSourceSpec={kind:'static',id:'wind-aep-weibull'};
const LIVE_FILE:ArtifactSourceSpec={kind:'static',id:'wind-aep-live-file'};
type Mode='static'|'file'|'live';
const MODES:{id:Mode;label:string}[]=[{id:'static',label:'Static artifact'},{id:'file',label:'Live file'},{id:'live',label:'Live (FastAPI)'}];
const DEFAULT_SERVICE='http://127.0.0.1:8765';
const INPUTS=[
  {id:'k',label:'Weibull shape k',min:1,max:4,step:0.1,unit:''},
  {id:'c',label:'Weibull scale c at 100 m',min:3,max:15,step:0.1,unit:'m/s'},
  {id:'hubHeight',label:'Hub height',min:40,max:250,step:5,unit:'m'},
] as const;
type Inputs=Record<(typeof INPUTS)[number]['id'],number>;
function query(name:string):string|null{try{return new URLSearchParams(location.search).get(name);}catch{return null;}}

export function LiveWind(){
  const service=query('service')||DEFAULT_SERVICE;
  const [mode,setMode]=useState<Mode>(query('live')==='1'?'live':query('file')==='1'?'file':'static');
  const [inputs,setInputs]=useState<Inputs>({k:2,c:8,hubHeight:120});
  const live:ArtifactSourceSpec={kind:'http',url:service.replace(/\/$/,'')+'/compute/wind-reference',body:inputs,id:'wind-aep-live'};
  return <div className="python-wind-live" data-testid="python-wind-live" data-mode={mode}>
    <div role="radiogroup" aria-label="Result source" style={{display:'flex',gap:8,padding:'16px 20px 0',flexWrap:'wrap'}}>
      {MODES.map(({id:value,label})=><button key={value} type="button" role="radio" aria-checked={mode===value} data-testid={'mode-'+value}
        onClick={()=>setMode(value)} style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--site-border,#dce5ec)',background:mode===value?'var(--site-accent,#286f89)':'transparent',color:mode===value?'#fff':'inherit',cursor:'pointer'}}>
        {label}</button>)}
    </div>
    {mode==='live'?<fieldset style={{display:'flex',gap:16,flexWrap:'wrap',margin:'12px 20px 0',padding:'10px 14px',border:'1px solid var(--site-border,#dce5ec)',borderRadius:6}}>
      <legend style={{fontSize:12,padding:'0 4px'}}>Inputs posted to {service}</legend>
      {INPUTS.map(field=><label key={field.id} style={{display:'grid',gap:4,fontSize:12,minWidth:150}}>
        <span>{field.label}{field.unit?` (${field.unit})`:''}</span>
        <input type="number" data-testid={'input-'+field.id} min={field.min} max={field.max} step={field.step} value={inputs[field.id]}
          onChange={event=>{const value=event.currentTarget.valueAsNumber;setInputs(previous=>({...previous,[field.id]:value}));}}/>
      </label>)}
    </fieldset>:null}
    {mode==='live'
      ?<ArtifactSource source={live} fallback={STATIC} show={['aep','cf','aep-8','table','curve']}/>
      :mode==='file'
        ?<ArtifactSource key="file" source={LIVE_FILE} fallback={STATIC} show={['aep-8','table','curve']}/>
        :<ArtifactSource key="static" source={STATIC} show={['aep-8','table','curve']}/>}
  </div>;
}
