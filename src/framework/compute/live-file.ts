/** ComputeAdapter over a static artifact file written by a producer outside the page (F202). It calls
 * loadArtifact and, in the dev server only, onArtifactChanged. The page never starts or stops the producer. */
import type {Artifact} from '../foundation/artifact.ts';
import {loadArtifact} from '../foundation/artifact-loader.ts';
import {artifactWatchAvailable,onArtifactChanged,type ArtifactChange} from '../foundation/artifact-live.ts';
import {describeCapabilities,refuse,supported,unsupported,type ComputeAdapter,type ComputeObservation,type ComputeOutcome} from './adapter.ts';

export const LIVE_FILE_CANCEL_REASON='A file producer (a Python script or watcher) runs outside the page; the page did not start it and cannot stop it.';
export const LIVE_FILE_CAPABILITIES=describeCapabilities({
  submit:unsupported('A file producer runs outside the page; run its Python step, the page only reads the file.'),
  progress:unsupported('The page sees the file only once it is written; there is no progress.'),
  cancel:unsupported(LIVE_FILE_CANCEL_REASON),
  interrupt:unsupported(LIVE_FILE_CANCEL_REASON),
  result:supported('Reads and validates the artifact file beside the page.'),
  history:unsupported('Only the current file exists; earlier versions are not kept.'),
  durableResult:supported('The artifact file is the result; it survives page reloads and restarts.'),
  inputs:unsupported('The producer does not declare its inputs to the page.'),
});

type Fetcher=Parameters<typeof loadArtifact>[1]['fetch'];
type Watch=(id:string,listener:(change:ArtifactChange)=>void)=>()=>void;
export type LiveFileAdapter=ComputeAdapter<never,Artifact>&{readonly id:string;readonly watchable:boolean;watch(listener:(change:ArtifactChange)=>void):()=>void};

export function createLiveFileAdapter(source:{id:string;base:string;fetch?:Fetcher;watch?:Watch}):LiveFileAdapter{
  const path='live-file' as const,capabilities=LIVE_FILE_CAPABILITIES;
  const watch=source.watch??(artifactWatchAvailable?onArtifactChanged:null);
  return {
    path,id:source.id,capabilities,label:source.id,watchable:watch!==null,
    inputs:()=>refuse(path,capabilities,'inputs'),
    async submit():Promise<ComputeOutcome<Artifact>>{return refuse(path,capabilities,'submit');},
    async cancel(){refuse(path,capabilities,'cancel');},
    async interrupt(){refuse(path,capabilities,'interrupt');},
    async result(_runId,signal){return (await loadArtifact(source.id,{base:source.base,signal,...(source.fetch?{fetch:source.fetch}:{})})).artifact;},
    async history():Promise<readonly ComputeObservation[]>{return refuse(path,capabilities,'history');},
    /** Dev server only (bridge level 2.5); a built page has no watcher, and then this is inert. */
    watch(listener){return watch?watch(source.id,listener):()=>{};},
  };
}
