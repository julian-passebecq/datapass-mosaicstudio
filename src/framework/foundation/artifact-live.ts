/**
 * Bridge level 2.5 (dev only): the dev server's artifact-watch plugin pushes `datapass:artifact-changed`
 * when a producer rewrites artifacts/<id>.json. Built clients have no `import.meta.hot`, so this is inert there.
 */
export const ARTIFACT_CHANGED_EVENT='datapass:artifact-changed';
export type ArtifactChange={id:string;sha256:string};
type Listener=(change:ArtifactChange)=>void;
const listeners=new Set<Listener>();
export const artifactWatchAvailable=Boolean(import.meta.hot);
if(import.meta.hot){
  import.meta.hot.on(ARTIFACT_CHANGED_EVENT,(data:unknown)=>{
    const change=data as Partial<ArtifactChange>|null;
    if(!change||typeof change.id!=='string'||typeof change.sha256!=='string')return;
    for(const listener of [...listeners])listener({id:change.id,sha256:change.sha256});
  });
}
/** Subscribe to file changes for one artifact id; returns the unsubscribe function. */
export function onArtifactChanged(id:string,listener:Listener):()=>void{
  const filtered:Listener=change=>{if(change.id===id)listener(change);};
  listeners.add(filtered);return()=>{listeners.delete(filtered);};
}
