import {useCallback,useEffect,useMemo,useState} from 'react';
import {useRuntime} from '../hooks';
import {ArtifactView} from './ArtifactView';
import {browserPreferences} from '../storage/kv';
import {SiteRunError,SiteRunStore,type SavedSiteRun} from '../storage/site-runs';
import {AbPairError,abCompatibility,clearAbPair,createAbPair,loadAbPair,openAbPair,saveAbPair,type AbPair,type ReopenedAbPair} from '../storage/ab-pairs';
import type {Scalar} from '../types';

/** F207: A/B comparison of two saved runs that survives reopen (shown only when the client binds `durableRuns`).
 * The pair is kept in this browser as references (result hashes, run ids, model versions); both results are read
 * back from the paired ResultStore by hash and compared with the compareRuns rules. Nothing is recomputed. */
const NOT_RECOMPUTED='Not recomputed: both results reopened from the result store by hash';
const short=(sha:string)=>sha.slice(0,12);
const numberText=(v:Scalar)=>v===null?'Unavailable':typeof v==='number'?new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(v):String(v);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const label=(r:SavedSiteRun)=>`${short(r.resultSha256)} / ${r.savedAt}${r.run?` / ${r.run.model} ${r.run.modelVersion}`:''}`;

export function SavedComparison({resource,taskId}:{resource:string;taskId:string}){
  const runtime=useRuntime();
  const binding=runtime.definition.durableRuns![resource]!;
  const app=useMemo(()=>({id:runtime.manifest.id,version:runtime.manifest.version}),[runtime]);
  const prefs=useMemo(()=>browserPreferences().port,[]);
  const store=useMemo(()=>{const c=binding.link.get();return c?new SiteRunStore(c):null;},[binding]);
  const [runs,setRuns]=useState<SavedSiteRun[]|null>(null);
  const [initial]=useState(()=>loadAbPair(prefs,app.id));
  const [pair,setPair]=useState<AbPair|null>(initial.pair);
  const [notice,setNotice]=useState<string|null>(initial.notice);
  const [error,setError]=useState<AbPairError|SiteRunError|null>(null);
  const [shown,setShown]=useState<ReopenedAbPair|null>(null);
  const [choice,setChoice]=useState({a:'',b:''});
  const [busy,setBusy]=useState(false);

  const refresh=useCallback(async()=>{
    if(!store)return null;
    try{const list=(await store.list(app)).runs;setRuns(list);return list;}
    catch(e){setRuns(null);setError(e instanceof SiteRunError?e:new SiteRunError(message(e),'refused'));return null;}
  },[store,app]);
  useEffect(()=>{void refresh();},[refresh]);

  const present=(runs??[]).filter(r=>r.taskId===taskId&&r.present&&r.run);
  const a=present.find(r=>r.resultSha256===choice.a),b=present.find(r=>r.resultSha256===choice.b);
  const verdict=a&&b?abCompatibility(a,b):null;

  async function show(next:AbPair){
    if(!store)return;
    setBusy(true);setError(null);setShown(null);
    try{const list=await refresh();if(list)setShown(await openAbPair(store,app,next,list));}
    catch(e){setError(e instanceof AbPairError||e instanceof SiteRunError?e:new AbPairError(message(e),'unreadable'));}
    finally{setBusy(false);}
  }
  async function compareAndKeep(){
    if(!a||!b)return;
    try{
      const next=createAbPair(app,a,b);
      try{saveAbPair(prefs,next);setNotice('Comparison kept in this browser as two result references (hashes, run ids, model versions); no result or input value is stored.');}
      catch(e){setNotice(message(e));}
      setPair(next);await show(next);
    }catch(e){setError(e instanceof AbPairError?e:new AbPairError(message(e),'invalid'));}
  }

  const c=shown?.comparison;
  return <section className="foundation-comparison" data-testid="ab-comparison" data-pair={pair?'saved':'none'} data-state={shown?'shown':error?error.kind:'idle'}>
    <h3>Saved results A/B</h3>
    {notice&&<p className="foundation-notice" role="status" data-testid="ab-notice">{notice}</p>}
    {!store&&<p className="foundation-note">Pair this page with the local runtime (Saved runs, under the parameters) to compare saved results. {pair?'A saved comparison is waiting; it reopens once the runtime is paired.':''}</p>}
    {store&&<div className="foundation-parameters">
      <label>A<select aria-label="Saved result A" value={choice.a} onChange={e=>setChoice({...choice,a:e.target.value})}><option value="">Choose a saved result</option>{present.map(r=><option key={r.resultSha256} value={r.resultSha256}>{label(r)}</option>)}</select></label>
      <label>B<select aria-label="Saved result B" value={choice.b} onChange={e=>setChoice({...choice,b:e.target.value})}><option value="">Choose a saved result</option>{present.map(r=><option key={r.resultSha256} value={r.resultSha256}>{label(r)}</option>)}</select></label>
      <button type="button" data-testid="ab-compare" disabled={busy||!verdict?.ok} onClick={()=>void compareAndKeep()}>Compare and keep this pair</button>
      {verdict&&!verdict.ok&&<p className="foundation-notice" role="alert" data-testid="ab-refused">{verdict.reason}</p>}
      {runs&&present.length<2&&<p className="foundation-note">Save at least two runs of this task to compare them.</p>}
    </div>}
    {pair&&<p className="foundation-note" data-testid="ab-saved-pair">Saved comparison: A {short(pair.a.resultSha256)} ({pair.a.modelVersion}), B {short(pair.b.resultSha256)} ({pair.b.modelVersion}), kept {pair.savedAt}. <button type="button" disabled={!store||busy} data-testid="ab-reopen" onClick={()=>void show(pair)}>Reopen saved comparison</button> <button type="button" onClick={()=>{clearAbPair(prefs,app.id);setPair(null);setShown(null);setNotice('Saved comparison removed from this browser. The results stay in the result store.');}}>Forget</button></p>}
    {error&&<p className="foundation-notice" role="alert" data-testid="ab-error" data-kind={error.kind}>{error.message}</p>}
    {shown&&c&&<section data-testid="ab-result" data-a={shown.a.resultSha256} data-b={shown.b.resultSha256}>
      <p><em className="foundation-badge">{NOT_RECOMPUTED}</em> A: run {shown.a.run.runId}, result {short(shown.a.resultSha256)}. B: run {shown.b.run.runId}, result {short(shown.b.resultSha256)}. Model {shown.a.run.model} {shown.a.run.modelVersion}.</p>
      <h4>Saved inputs</h4><table><thead><tr><th>Input</th><th>A</th><th>B</th></tr></thead><tbody>{c.parameters.map(p=><tr key={p.id} data-changed={p.changed}><th>{p.id}</th><td>{numberText(p.before)}</td><td>{numberText(p.after)}</td></tr>)}</tbody></table>
      {c.metrics.length>0&&<><h4>Declared result metrics</h4><table><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Difference</th></tr></thead><tbody>{c.metrics.map(m=><tr key={m.id}><th>{m.title} {m.unit}</th><td>{numberText(m.before)}</td><td>{numberText(m.after)}</td><td>{numberText(m.delta)}</td></tr>)}</tbody></table></>}
      <h4>Differences by row</h4>{c.deltaArtifact?<ArtifactView artifact={c.deltaArtifact}/>:<p className="foundation-note" data-testid="ab-rows-reason">{c.rows.comparable?'No number column to compare.':c.rows.reason}</p>}
      {c.rows.comparable&&c.rows.truncated&&<p className="foundation-note">Only the first rows are compared.</p>}
      <p className="foundation-note">Same task, site version, model and model version. No unit conversion or aggregation. This is not scientific validation or a performance benchmark.</p>
    </section>}
  </section>;
}
