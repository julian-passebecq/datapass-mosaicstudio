/** Param Lab: schema-driven sliders -> worker rebuild -> 3D view -> click -> selection details.
 * Client-owned TSX. Model inputs live in `input` fields, everything else in `view` fields.
 */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {useElementSize,useSelection} from '../../src/framework/visual';
import {PARAM_SCHEMA,type Params} from './params.ts';
import {FEATURES,featureById} from './features.ts';
import {selectionDetails,DISCLAIMER} from './details.ts';
import {toBinaryStl,type BuildResult} from './geometry.ts';
import {LabViewport,type CameraPreset} from './viewport.ts';
import './param-lab.css';

type Build = {status:'busy'|'ready'|'error'; result:BuildResult|null; key:string; message?:string};

function useWorkerBuild(params:Params){
  const key=useMemo(()=>JSON.stringify(PARAM_SCHEMA.map(p=>params[p.id])),[params]);
  const [build,setBuild]=useState<Build>({status:'busy',result:null,key:''});
  const worker=useRef<Worker|null>(null),seq=useRef(0),inFlight=useRef(false),queued=useRef<{seq:number;params:Params;key:string}|null>(null),keys=useRef(new Map<number,string>());
  const send=useCallback(()=>{
    const job=queued.current;if(!job||inFlight.current||!worker.current)return;
    queued.current=null;inFlight.current=true;keys.current.set(job.seq,job.key);
    worker.current.postMessage({type:'build',seq:job.seq,params:{...job.params}});
  },[]);
  useEffect(()=>{
    const w=new Worker(new URL('./geometry.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=(event:MessageEvent)=>{
      const data=event.data as {type:'result'|'error';seq:number;result?:BuildResult;message?:string};
      inFlight.current=false;const k=keys.current.get(data.seq)||'';keys.current.delete(data.seq);
      // Latest-wins: a result for superseded params is dropped, the queued request goes next.
      if(data.seq===seq.current)setBuild(data.type==='result'?{status:'ready',result:data.result!,key:k}:old=>({status:'error',result:old.result,key:k,message:data.message}));
      send();
    };
    w.onerror=event=>{inFlight.current=false;setBuild(old=>({...old,status:'error',message:event.message||'The geometry worker failed to start.'}));};
    send();
    return()=>{w.terminate();worker.current=null;inFlight.current=false;};
  },[send]);
  useEffect(()=>{
    seq.current+=1;queued.current={seq:seq.current,params,key};
    setBuild(old=>old.key===key&&old.status==='ready'?old:{...old,status:'busy'});
    send();
  },[key,params,send]);
  return {...build,current:build.key===key};
}

function download(name:string,data:BlobPart,type:string){
  const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const fmt=(v:number,step:number)=>step<1?v.toFixed(2):String(v);

export function ParamLab(){
  const runtime=useRuntime(),state=useSiteState(),{selected,select}=useSelection('view-selection');
  const params=useMemo(()=>Object.fromEntries(PARAM_SCHEMA.map(p=>[p.id,Number(state.values[p.id])])) as Params,[state.values]);
  const camera=String(state.values['view-camera']) as CameraPreset,showEdges=Boolean(state.values['view-edges']),showWire=Boolean(state.values['view-wire']);
  const build=useWorkerBuild(params);
  const {ref,width,height,ready}=useElementSize();
  const host=useRef<HTMLDivElement|null>(null),view=useRef<LabViewport|null>(null),fitted=useRef(false);
  const [viewError,setViewError]=useState('');const [drawn,setDrawn]=useState('');const [hover,setHover]=useState('none');
  const [hit,setHit]=useState<{featureId:string;point:[number,number,number]}|null>(null);const [copied,setCopied]=useState('');
  const down=useRef<{x:number;y:number}|null>(null);

  useEffect(()=>{
    if(!host.current)return;
    try{view.current=new LabViewport(host.current);}catch(e){setViewError(e instanceof Error?e.message:'WebGL is unavailable.');return;}
    return()=>{view.current?.dispose();view.current=null;fitted.current=false;};
  },[]);
  useEffect(()=>{if(ready)view.current?.resize(Math.round(width),Math.round(height));},[ready,width,height]);
  useEffect(()=>{
    const v=view.current,r=build.result;if(!v||!r||!ready)return;
    v.setResult(r,!fitted.current);if(!fitted.current){fitted.current=true;v.setCamera(camera);}
    setDrawn(r.hash);
  },[build.result,ready]); // camera handled below; geometry rebuilds keep the user's orbit
  useEffect(()=>{if(fitted.current)view.current?.setCamera(camera);},[camera]);
  useEffect(()=>{view.current?.setSelection(selected);},[selected,drawn]);
  useEffect(()=>{view.current?.setHover(hover);},[hover,drawn]);
  useEffect(()=>{view.current?.setOverlays(showEdges,showWire);},[showEdges,showWire,drawn]);
  useEffect(()=>{if(hit&&hit.featureId!==selected)setHit(null);},[selected,hit]);

  const result=build.result;
  const captureState=viewError||build.status==='error'?'error':build.status==='ready'&&build.current&&ready&&drawn===result?.hash?'ready':'busy';
  const feature=selected==='none'?null:featureById(selected);
  const details=useMemo(()=>feature&&result?selectionDetails({featureId:feature.id,params,result,hit:hit?.featureId===feature.id?hit.point:null}):null,[feature,params,result,hit]);
  const detailsText=details?JSON.stringify(details,null,2):'';
  const groups=['Section','Blade','Hub'] as const;

  const onPointerUp=(event:React.PointerEvent)=>{
    const start=down.current;down.current=null;
    if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>4)return; // a drag is an orbit, not a pick
    const picked=view.current?.pick(event.clientX,event.clientY);
    if(picked){setHit(picked);select(picked.featureId);}else{setHit(null);select('none');}
  };
  const onPointerMove=(event:React.PointerEvent)=>{
    if(event.buttons)return;
    setHover(view.current?.pick(event.clientX,event.clientY)?.featureId??'none');
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(detailsText);setCopied('Copied to the clipboard.');}
    catch{setCopied('Clipboard unavailable: select the text and copy it manually.');}
  };

  return <section className="param-lab" data-param-lab data-capture-state={captureState} data-mesh-hash={captureState==='ready'?result?.hash:''} data-kernel={result?.kernel||''} data-selected-feature={selected}>
    <header className="pl-head">
      <p className="pl-illustrative" role="note">{DISCLAIMER}</p>
      <div className="pl-badges">
        {result&&<span className={'pl-badge '+(result.kernel==='manifold-3d'?'ok':'warn')} title={result.kernelNote}>{result.kernel==='manifold-3d'?'Kernel: manifold-3d (WASM)':'Kernel: JS preview (no boolean)'}</span>}
        <span className={'pl-badge '+(captureState==='busy'?'busy':captureState)} role="status" aria-live="polite">{captureState==='busy'?'Rebuilding…':captureState==='error'?'Error':'Up to date'}</span>
      </div>
    </header>
    <div className="pl-grid">
      <aside className="pl-params" aria-label="Model parameters">
        {groups.map(group=><fieldset key={group}><legend>{group}</legend>
          {PARAM_SCHEMA.filter(p=>p.group===group).map(p=><label key={p.id} className="pl-slider" title={p.help} data-param={p.id}>
            <span className="pl-slider-head"><span>{p.label}</span><output>{fmt(params[p.id],p.step)}{p.unit?' '+p.unit:''}</output></span>
            <input type="range" min={p.min} max={p.max} step={p.step} value={params[p.id]} aria-describedby={'help-'+p.id} onChange={e=>runtime.set(p.id,Number(e.currentTarget.value))}/>
            <small id={'help-'+p.id}>{p.help}</small>
          </label>)}
        </fieldset>)}
        <button type="button" onClick={()=>runtime.patch(Object.fromEntries(PARAM_SCHEMA.map(p=>[p.id,p.default])))}>Reset parameters</button>
      </aside>
      <div className="pl-stage">
        <div className="pl-toolbar" role="group" aria-label="View">
          {(['iso','front','side','top'] as const).map(c=><button type="button" key={c} aria-pressed={camera===c} onClick={()=>runtime.applyCue({'view-camera':c})}>{c==='iso'?'Iso':c[0].toUpperCase()+c.slice(1)}</button>)}
          <label><input type="checkbox" checked={showEdges} onChange={()=>runtime.applyCue({'view-edges':!showEdges})}/> Edges</label>
          <label><input type="checkbox" checked={showWire} onChange={()=>runtime.applyCue({'view-wire':!showWire})}/> Wireframe</label>
        </div>
        <div className="pl-viewport" ref={node=>{host.current=node;ref(node);}} onPointerDown={e=>{down.current={x:e.clientX,y:e.clientY};}} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={()=>setHover('none')} data-hover={hover}>
          {captureState==='busy'&&<div className="pl-busy" aria-hidden="true">Rebuilding in worker…</div>}
          {hover!=='none'&&<div className="pl-hover" aria-hidden="true">{featureById(hover)?.label}</div>}
        </div>
        {viewError&&<p role="alert">3D view unavailable ({viewError}). Use the feature list to select.</p>}
        {build.status==='error'&&<p role="alert">Rebuild failed: {build.message}. The last valid solid is still shown.</p>}
        {result&&<dl className="pl-metrics">
          <div><dt>Section</dt><dd>{result.naca}</dd></div>
          <div><dt>Triangles</dt><dd>{result.metrics.triangles.toLocaleString('en-US')}</dd></div>
          <div><dt>Volume</dt><dd>{(result.metrics.volume/1000).toFixed(1)} cm³</dd></div>
          <div><dt>Area</dt><dd>{(result.metrics.area/100).toFixed(1)} cm²</dd></div>
          <div><dt>Mesh hash</dt><dd><code data-testid="mesh-hash">{result.hash}</code></dd></div>
        </dl>}
        <div className="pl-export" role="group" aria-label="Export">
          <button type="button" disabled={!result} onClick={()=>result&&download('param-lab-'+result.hash+'.stl',toBinaryStl(result),'model/stl')}>Download STL</button>
          <button type="button" onClick={()=>download('param-lab-params.json',JSON.stringify({format:'param-lab.params',version:1,params},null,2),'application/json')}>Download params JSON</button>
          <button type="button" disabled title="manifold-3d is a mesh kernel: no B-rep, so no STEP. A B-rep kernel (OpenCascade via replicad) would be needed.">STEP (needs a B-rep kernel)</button>
        </div>
        {result?.kernel==='js-preview'&&<p className="pl-warn" role="note">{result.kernelNote} Volume counts overlaps twice; STL is a preview soup, not a watertight solid.</p>}
      </div>
      <aside className="pl-details" aria-label="Selection details">
        <h3>Selection details</h3>
        <label className="pl-pick">Feature
          <select value={selected} onChange={e=>{setHit(null);select(e.currentTarget.value);}}>
            <option value="none">Nothing selected</option>
            {FEATURES.filter(f=>result?.features.includes(f.id)||f.id===selected).map(f=><option key={f.id} value={f.id}>{f.label} ({f.kind})</option>)}
          </select>
        </label>
        {!feature?<p className="pl-hint">Click a face or an edge in the 3D view (or pick one above). The panel then shows its stable id, the parameters that drive it and its geometry references, copyable as JSON.</p>:<>
          <p className="pl-feature"><code data-testid="feature-id">{feature.id}</code> <span className="pl-kind">{feature.kind}</span></p>
          {details&&!details.feature.present&&<p className="pl-warn" role="status">Not present in the current geometry (e.g. fewer blades or buried in the hub). The selection is kept.</p>}
          <p>{feature.note}</p>
          <table className="pl-driving"><caption>Driving parameters</caption><thead><tr><th>Parameter</th><th>Value</th><th>Range</th></tr></thead><tbody>
            {details?.drivingParams.map(p=><tr key={p.id}><td>{p.label}</td><td>{fmt(p.value,p.step)} {p.unit}</td><td>{p.min} – {p.max}</td></tr>)}
          </tbody></table>
          <div className="pl-json-head"><strong>JSON</strong><button type="button" onClick={copy}>Copy as JSON</button></div>
          <textarea readOnly value={detailsText} aria-label="Selection details JSON" rows={14} data-testid="selection-json" onFocus={e=>e.currentTarget.select()}/>
          {copied&&<p role="status" className="pl-hint">{copied}</p>}
          <button type="button" onClick={()=>{setHit(null);select('none');}}>Clear selection</button>
        </>}
      </aside>
    </div>
  </section>;
}
