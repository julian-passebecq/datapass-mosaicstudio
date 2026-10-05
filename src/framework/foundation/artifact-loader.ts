import {identifier} from '../guards.ts';
import {ARTIFACT_BYTES,validateArtifact,type Artifact} from './artifact.ts';

/** Static artifacts live in the client's public dir: clients/<id>/public/artifacts/<artifact-id>.json. */
export const ARTIFACT_DIRECTORY='artifacts/';
export type ArtifactLoadState={status:'loading';id:string}|{status:'ready';id:string;artifact:Artifact;url:string}|{status:'error';id:string;message:string;url?:string};
type FetchLike=(url:string,init?:{signal?:AbortSignal;credentials?:'same-origin';cache?:'no-cache'})=>Promise<{ok:boolean;status:number;headers:{get(name:string):string|null};text():Promise<string>}>;

export function artifactUrl(id:string,base:string):string{
  identifier(id,'artifact id');
  return new URL(ARTIFACT_DIRECTORY+id+'.json',new URL('./',base)).href;
}
/** Fetch, bound, parse and validate one static artifact. Every failure is a readable Error. */
export async function loadArtifact(id:string,options:{base:string;fetch?:FetchLike;signal?:AbortSignal}):Promise<{artifact:Artifact;url:string}>{
  const url=artifactUrl(id,options.base),fetcher=options.fetch??(globalThis.fetch as unknown as FetchLike);
  if(new URL(url).origin!==new URL(options.base).origin)throw new Error('Artifacts must be same-origin static files');
  let response;
  try{response=await fetcher(url,{signal:options.signal,credentials:'same-origin',cache:'no-cache'});}
  catch(error){if((error as Error)?.name==='AbortError')throw error;throw new Error(`Artifact "${id}" could not be fetched from ${ARTIFACT_DIRECTORY}${id}.json`);}
  if(!response.ok)throw new Error(`Artifact "${id}" is missing (HTTP ${response.status}). Run the Python step that writes ${ARTIFACT_DIRECTORY}${id}.json into the client public directory.`);
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>ARTIFACT_BYTES*2)throw new Error(`Artifact "${id}" exceeds the ${ARTIFACT_BYTES}-byte budget`);
  const body=await response.text();
  if(new TextEncoder().encode(body).byteLength>ARTIFACT_BYTES*2)throw new Error(`Artifact "${id}" exceeds the ${ARTIFACT_BYTES}-byte budget`);
  let json:unknown;
  try{json=JSON.parse(body);}catch{throw new Error(`Artifact "${id}" is not valid JSON`);}
  let artifact:Artifact;
  try{artifact=validateArtifact(json);}catch(error){throw new Error(`Artifact "${id}" failed datapass.artifact v1 validation: ${(error as Error).message}`);}
  if(artifact.id!==id)throw new Error(`Artifact file ${id}.json declares id "${artifact.id}"`);
  return {artifact,url};
}
