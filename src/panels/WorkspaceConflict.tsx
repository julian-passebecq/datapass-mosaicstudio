import {Button} from '../fluent';
import {Download} from 'lucide-react';
import {roomStore,useRoomStore} from '../store';
import {createBrowserHost} from '../core/host';

/** Cross-tab conflict banner (F205, U204). Shown while another writer's saved workspace differs from the one this tab
 * loaded; nothing is saved until the user keeps theirs, keeps mine or exports both. Never runs a cell or a query. */
export function WorkspaceConflictBanner(){
  const conflict=useRoomStore(s=>s.datapass.conflict),resolve=useRoomStore(s=>s.datapass.resolveConflict);
  if(!conflict)return null;
  const who=conflict.theirs?`another tab (revision ${conflict.theirs.rev})`:'another tab or an older studio';
  const what=conflict.theirsRaw===null?'reset the saved workspace':'saved a different version of this workspace';
  function exportBoth(){
    const host=createBrowserHost(),mine=roomStore.getState().datapass.workspaceDocument();
    host.saveDownload('mosaicstudio-workspace-this-tab.json',new Blob([JSON.stringify(mine,null,2)],{type:'application/json'}));
    const theirs=roomStore.getState().datapass.conflict?.theirsRaw??null;
    if(theirs!==null){
      let pretty=theirs;try{pretty=JSON.stringify(JSON.parse(theirs),null,2);}catch{/* exported as stored */}
      host.saveDownload('mosaicstudio-workspace-other-tab.json',new Blob([pretty],{type:'application/json'}));
    }
  }
  return <div className="global-conflict" role="alert" data-testid="workspace-conflict" data-code={conflict.code} data-sidecar={conflict.sidecarMatches?'match':'mismatch'}>
    <span><strong>The workspace was changed by {who}.</strong> It {what} after this tab loaded it. Nothing is saved here until you choose.
      {' '}Exports contain your SQL text and model inputs; review them before sharing. <code>{conflict.code}</code>
      {conflict.error&&<em role="status" data-testid="workspace-conflict-error"> {conflict.error}</em>}</span>
    <Button size="small" appearance="primary" onClick={()=>resolve('mine')}>Keep mine</Button>
    <Button size="small" onClick={()=>resolve('theirs')}>Take theirs</Button>
    <Button size="small" icon={<Download size={14}/>} onClick={exportBoth}>Export both</Button>
  </div>;
}
