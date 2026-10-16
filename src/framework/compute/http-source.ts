/** ComputeAdapter over a live loopback artifact service (F202). It calls loadHttpArtifact only. */
import type {Artifact} from '../foundation/artifact.ts';
import {loadHttpArtifact} from '../foundation/artifact-loader.ts';
import {describeCapabilities,errorMessage,isAbort,refuse,supported,unsupported,type ComputeAdapter,type ComputeObservation} from './adapter.ts';

export const HTTP_CANCEL_REASON='Aborting only stops reading the answer; the service has no cancel request and may keep computing.';
export const HTTP_SOURCE_CAPABILITIES=describeCapabilities({
  submit:supported('One request to the loopback service; the answer is validated as datapass.artifact v1.'),
  progress:unsupported('A single HTTP request reports no progress.'),
  cancel:unsupported(HTTP_CANCEL_REASON),
  interrupt:unsupported('The service runs outside the page; the page cannot interrupt it.'),
  result:unsupported('Each answer is returned once with its request; the service keeps no run to fetch again.'),
  history:unsupported('The service keeps no run history for the page.'),
  durableResult:unsupported('The answer is not stored; reload sends the request again.'),
  inputs:unsupported('The service does not declare its inputs to the page.'),
});

type Fetcher=Parameters<typeof loadHttpArtifact>[1]['fetch'];
export type HttpSourceAdapter=ComputeAdapter<unknown,Artifact>&{readonly url:string};

export function createHttpSourceAdapter(source:{url:string;id?:string;base:string;fetch?:Fetcher}):HttpSourceAdapter{
  const path='http-source' as const,capabilities=HTTP_SOURCE_CAPABILITIES;
  let sequence=0;
  return {
    path,url:source.url,capabilities,label:source.id??source.url,
    inputs:()=>refuse(path,capabilities,'inputs'),
    async submit(body,options={}){
      const runId=`http-${++sequence}`;
      try{
        const {artifact}=await loadHttpArtifact({url:source.url,...(body===undefined?{}:{body}),...(source.id===undefined?{}:{id:source.id})},{base:source.base,signal:options.signal,...(source.fetch?{fetch:source.fetch}:{})});
        return {runId,state:'succeeded',result:artifact,message:''};
      }catch(error){
        if(isAbort(error))return {runId,state:'not-observed',result:null,message:'Stopped reading the answer; the service may still have computed it.'};
        return {runId,state:'failed',result:null,message:errorMessage(error)};
      }
    },
    async cancel(){refuse(path,capabilities,'cancel');},
    async interrupt(){refuse(path,capabilities,'interrupt');},
    async result(){return refuse(path,capabilities,'result');},
    async history():Promise<readonly ComputeObservation[]>{return refuse(path,capabilities,'history');},
  };
}
