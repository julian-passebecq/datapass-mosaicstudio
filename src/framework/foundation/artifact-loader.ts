import {identifier} from '../guards.ts';
import {ARTIFACT_BYTES,validateArtifact,type Artifact} from './artifact.ts';

/** Static artifacts live in the client's public dir: clients/<id>/public/artifacts/<artifact-id>.json. */
export const ARTIFACT_DIRECTORY='artifacts/';
export type ArtifactLoadState={status:'loading';id:string}|{status:'ready';id:string;artifact:Artifact;url:string}|{status:'error';id:string;message:string;url?:string};
type FetchLike=(url:string,init?:{method?:'GET'|'POST';body?:string;headers?:Record<string,string>;signal?:AbortSignal;credentials?:'same-origin'|'omit';cache?:'no-cache'|'no-store';mode?:'cors'})=>Promise<{ok:boolean;status:number;headers:{get(name:string):string|null};text():Promise<string>}>;

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

/** Where an artifact comes from: a static file beside the page, or a live loopback service (bridge level 3). */
export type ArtifactSourceSpec={kind:'static';id:string}|{kind:'http';url:string;body?:unknown;id?:string};
/** Live services must be loopback (or same-origin): the prototype service has no auth and never leaves the machine. */
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
export const HTTP_REQUEST_BYTES=2048;
export function httpArtifactUrl(url:string,base:string):string{
  let parsed:URL;
  try{parsed=new URL(url,base);}catch{throw new Error(`Artifact service URL "${url}" is not a URL`);}
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error('Artifact service must use http(s)');
  if(parsed.username||parsed.password)throw new Error('Artifact service URL must not carry credentials');
  if(parsed.origin!==new URL(base).origin&&!LOOPBACK.has(parsed.hostname))throw new Error(`Artifact service must be loopback or same-origin, not ${parsed.host}`);
  return parsed.href;
}
async function readBounded(response:Awaited<ReturnType<FetchLike>>,label:string):Promise<unknown>{
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>ARTIFACT_BYTES*2)throw new Error(`${label} exceeds the ${ARTIFACT_BYTES}-byte budget`);
  const body=await response.text();
  if(new TextEncoder().encode(body).byteLength>ARTIFACT_BYTES*2)throw new Error(`${label} exceeds the ${ARTIFACT_BYTES}-byte budget`);
  try{return JSON.parse(body);}catch{throw new Error(`${label} is not valid JSON`);}
}
/** POST (when `body` is set) or GET a live service, then validate exactly like a static file. Cookies are never sent. */
export async function loadHttpArtifact(source:{url:string;body?:unknown;id?:string},options:{base:string;fetch?:FetchLike;signal?:AbortSignal}):Promise<{artifact:Artifact;url:string}>{
  const url=httpArtifactUrl(source.url,options.base),fetcher=options.fetch??(globalThis.fetch as unknown as FetchLike);
  let payload:string|undefined;
  if(source.body!==undefined){
    payload=JSON.stringify(source.body);
    if(new TextEncoder().encode(payload).byteLength>HTTP_REQUEST_BYTES)throw new Error(`Service request is above ${HTTP_REQUEST_BYTES} bytes`);
  }
  let response;
  try{response=await fetcher(url,{method:payload===undefined?'GET':'POST',...(payload===undefined?{}:{body:payload,headers:{'Content-Type':'application/json'}}),signal:options.signal,credentials:'omit',cache:'no-store',mode:'cors'});}
  catch(error){if((error as Error)?.name==='AbortError')throw error;throw new Error(`Artifact service ${new URL(url).origin} is unreachable`);}
  if(!response.ok){
    let detail='';
    if(response.status===422){try{const json=JSON.parse(await response.text()) as {detail?:{loc?:unknown[];msg?:string}[]};detail=': '+(json.detail??[]).slice(0,3).map(d=>`${(d.loc??[]).slice(1).join('.')} ${d.msg??''}`.trim()).join('; ');}catch{/* keep the status only */}}
    throw new Error(`Artifact service answered HTTP ${response.status}${detail}`);
  }
  const json=await readBounded(response,'Service response');
  let artifact:Artifact;
  try{artifact=validateArtifact(json);}catch(error){throw new Error(`Service response failed datapass.artifact v1 validation: ${(error as Error).message}`);}
  if(source.id!==undefined&&artifact.id!==source.id)throw new Error(`Service returned artifact "${artifact.id}", expected "${source.id}"`);
  return {artifact,url};
}
/** One entry point for both kinds. */
export function loadArtifactSource(source:ArtifactSourceSpec,options:{base:string;fetch?:FetchLike;signal?:AbortSignal}):Promise<{artifact:Artifact;url:string}>{
  return source.kind==='static'?loadArtifact(source.id,options):loadHttpArtifact(source,options);
}
