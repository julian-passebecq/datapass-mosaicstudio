import {useCallback,useEffect,useState} from 'react';
import {ArtifactView} from './framework/foundation/ArtifactView';
import {ARTIFACT_BYTES,validateArtifact,type Artifact} from './framework/foundation/artifact';
import './framework/site.css';
import './framework/visual-theme.css';

/** Pretty-printed exports are larger than their compact form; the compact form is still bounded by validateArtifact. */
export const ARTIFACT_FILE_BYTES=ARTIFACT_BYTES*2;
type Opened={artifact:Artifact;source:string;bytes:number};
type Problem={source:string;message:string};

/** Read, bound, parse and validate one artifact text. Throws a readable Error; never evaluates anything in it. */
export function readArtifactText(text:string):Artifact{
  if(new TextEncoder().encode(text).byteLength>ARTIFACT_FILE_BYTES)throw new Error(`An artifact file is limited to ${ARTIFACT_FILE_BYTES} bytes`);
  let json:unknown;
  try{json=JSON.parse(text);}catch{throw new Error('Not valid JSON');}
  return validateArtifact(json);
}

/**
 * Artifact file viewer (`?artifact=1`): opens a datapass.artifact v1 file exported by any producer (Contoso, a Python
 * script, the workbench) in the existing ArtifactView. The file is data only: it is validated with the same structural and
 * semantic checks as static client artifacts, nothing in it runs, and a rejected file leaves the current one in place.
 * Lineage is shown as the producer declared it; MosaicStudio did not observe or rerun that computation.
 */
export default function ArtifactFileViewer(){
  const [opened,setOpened]=useState<Opened|null>(null),[problem,setProblem]=useState<Problem|null>(null),[draft,setDraft]=useState(''),[paste,setPaste]=useState(false);
  const open=useCallback((source:string,text:string)=>{
    try{const artifact=readArtifactText(text);setOpened({artifact,source,bytes:new TextEncoder().encode(text).byteLength});setProblem(null);return true;}
    catch(e){setProblem({source,message:e instanceof Error?e.message:String(e)});return false;}
  },[]);
  const openFile=useCallback(async(file:File)=>{
    if(file.size>ARTIFACT_FILE_BYTES){setProblem({source:file.name,message:`An artifact file is limited to ${ARTIFACT_FILE_BYTES} bytes`});return;}
    open(file.name,await file.text());
  },[open]);
  useEffect(()=>{
    const over=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();};
    const drop=(e:DragEvent)=>{const f=e.dataTransfer?.files?.[0];if(!f)return;e.preventDefault();void openFile(f);};
    window.addEventListener('dragover',over);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragover',over);window.removeEventListener('drop',drop);};
  },[openFile]);
  const a=opened?.artifact,p=a?.provenance;
  return <div className="studio-site"><main id="site-main" className="artifact-file-viewer" data-testid="artifact-file-viewer" data-artifact-id={a?.id??''} data-source={opened?.source??''} data-problem={problem?'true':'false'} style={{maxWidth:1180,margin:'0 auto',padding:'16px clamp(12px,3vw,28px)',boxSizing:'border-box'}}>
    <header className="site-page-heading"><span className="site-kicker">DataPass / artifact file</span><h1>Open a datapass.artifact file</h1>
      <p>Validated as datapass.artifact v1 (structure and references) before it is shown. Nothing in the file runs. Lineage below is what the producer declared, not something this page observed.</p></header>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
      <label style={{cursor:'pointer',padding:'6px 12px',border:'1px solid #286f89',borderRadius:6,background:'#286f89',color:'#fff',fontWeight:600}}>Open artifact file<input type="file" accept=".json,application/json" hidden data-testid="artifact-file" aria-label="Open artifact file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void openFile(f);}}/></label>
      <button type="button" aria-pressed={paste} onClick={()=>{setPaste(v=>!v);setDraft('');}}>Paste JSON</button>
      <small>or drop a file anywhere · at most {ARTIFACT_FILE_BYTES.toLocaleString()} bytes</small>
    </div>
    {paste&&<form onSubmit={e=>{e.preventDefault();if(draft.trim()&&open('pasted JSON',draft))setPaste(false);}} style={{display:'grid',gap:6,marginTop:8}}>
      <textarea rows={8} value={draft} onChange={e=>setDraft(e.target.value)} aria-label="Artifact JSON" spellCheck={false}/>
      <span><button type="submit" disabled={!draft.trim()}>Load</button></span></form>}
    {problem&&<div role="alert" data-testid="artifact-problem" className="foundation-artifact-error"><strong>{problem.source} was not opened.</strong> {problem.message}{a?<> Still showing <b>{a.title}</b>.</>:null}</div>}
    {a&&p?<>
      <ArtifactView key={a.id+'|'+opened!.source} artifact={a}/>
      <section data-testid="artifact-lineage" aria-label="Declared lineage" className="foundation-artifact-provenance" style={{marginTop:12,overflowWrap:'anywhere'}}>
        <h2 style={{fontSize:15}}>Declared lineage</h2>
        <dl>
          <div><dt>File</dt><dd><code>{opened!.source}</code> · {opened!.bytes.toLocaleString()} bytes</dd></div>
          <div><dt>Provenance</dt><dd data-provenance-kind={p.kind}>{p.kind}</dd></div>
          {p.runId&&<div><dt>Run</dt><dd><code>{p.runId}</code></dd></div>}
          {p.producer&&<div><dt>Producer</dt><dd data-testid="artifact-producer">{p.producer.kind} · {p.producer.name}</dd></div>}
          {p.inputHash&&<div><dt>Input hash</dt><dd><code data-testid="artifact-input-hash">{p.inputHash}</code></dd></div>}
          {p.dependsOn?.length?<div><dt>Depends on</dt><dd>{p.dependsOn.join(', ')}</dd></div>:null}
        </dl>
        {p.inputs?.length?<div style={{overflowX:'auto'}}><table data-testid="artifact-inputs"><thead><tr><th>Input</th><th>Value</th><th>Unit</th><th>Evidence</th></tr></thead>
          <tbody>{p.inputs.map(i=><tr key={i.id} data-input={i.id}><td>{i.label}</td><td><code>{i.value===undefined?'—':String(i.value)}</code></td><td>{i.unit??''}</td><td>{(i.evidence??[]).map(e=><code key={e.path+e.start}>{e.path}:{e.start}-{e.end}</code>)}</td></tr>)}</tbody></table></div>:null}
        <p><small>Declared values may include sensitive inputs. Review before sharing an export.</small></p>
      </section></>
      :<p role="status" data-testid="artifact-empty">No artifact open yet.</p>}
  </main></div>;
}
