import {useState,useSyncExternalStore} from 'react';
import {useRuntime} from '../hooks';
import {createBrowserHost} from '../../core/host';
import {useRunJournal} from './RunScope';
import {BUNDLE_MIME,BundleError,bundleFromRecords,exportBundle} from './bundle';

/** F208: explicit provenance export of a run resource as one `datapass.bundle` v1 (candidate) file.
 * Shown next to the run workbench (mounted by the `runs` block). Exports the retained, succeeded runs of the journal:
 * their artifacts as exact text, run references, captured inputs, declared lineage and SHA256SUMS. Nothing is rerun,
 * nothing is written until the user reviews the sharing notice and presses Export, and the paired runtime token is
 * refused if any byte of the bundle would contain it. */
export function BundleExport({resource}:{resource:string}){
  const runtime=useRuntime(),{journal}=useRunJournal(resource);
  const history=useSyncExternalStore(journal.subscribe,journal.getSnapshot,journal.getSnapshot);
  const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false);
  const [result,setResult]=useState<{ok:true;sha:string;files:number;name:string}|{ok:false;code:string;message:string}|null>(null);
  const input=bundleFromRecords(history.records);
  async function run(){
    setBusy(true);
    try{
      const token=runtime.definition.durableRuns?.[resource]?.link.get()?.token??null;
      const exported=await exportBundle({title:`${runtime.manifest.title} / ${resource}`,...input,secrets:[token]});
      createBrowserHost().saveDownload(exported.fileName,new Blob([exported.text],{type:BUNDLE_MIME}));
      setResult({ok:true,sha:exported.bundleSha256,files:exported.files.length,name:exported.fileName});
    }catch(error){
      setResult(error instanceof BundleError?{ok:false,code:error.code,message:error.message}:{ok:false,code:'',message:(error as Error).message});
    }finally{setBusy(false);setReviewed(false);}
  }
  return <section className="foundation-bundle" data-testid="bundle-export" data-run-count={input.runs.length}>
    <h3>Provenance bundle</h3>
    <p className="foundation-note">One <code>datapass.bundle</code> v1 file (candidate format) with the {input.runs.length} retained successful run{input.runs.length===1?'':'s'} of this page: artifacts as exported, run references, captured inputs, declared lineage and SHA256SUMS. It re-imports with the same hashes in the artifact viewer and with <code>python py/datapass_bundle.py validate</code>. Not a signature, release or verified lineage; synthetic results stay labelled synthetic.</p>
    <p className="foundation-notice" role="note" data-testid="bundle-notice">Sharing review: the bundle contains captured input values and result data, which may be sensitive. Tokens and workspace secrets are never included; the export is refused if one would be.</p>
    <label><input type="checkbox" data-testid="bundle-reviewed" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the captured inputs and result data for sharing.</label>
    <button type="button" data-testid="bundle-export-button" disabled={!reviewed||busy||!input.runs.length} onClick={()=>void run()}>Export provenance bundle</button>
    {!input.runs.length&&<small className="foundation-note"> Run a task first: only retained successful results are exported.</small>}
    {result&&(result.ok
      ?<p role="status" data-testid="bundle-exported" data-bundle-sha={result.sha}>Exported {result.name}: {result.files} files, bundle {result.sha.slice(0,12)} (SHA-256 of SHA256SUMS).</p>
      :<p role="alert" data-testid="bundle-refused" data-code={result.code}>Not exported{result.code?` (${result.code})`:''}: {result.message}</p>)}
  </section>;
}
export default BundleExport;
