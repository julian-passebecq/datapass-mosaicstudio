import {validateModelAsset, type ModelAsset} from './model.ts';
import {inspectGlb, type InspectedGlb} from './glb.ts';

export async function verifyModelBytes(input:ModelAsset,bytes:Uint8Array):Promise<InspectedGlb> {
  const asset=validateModelAsset(input);
  if(bytes.byteLength!==asset.byteLength)throw new Error('Model byte length does not match the approved asset');
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
  const sha=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(sha!==asset.sha256)throw new Error('Model SHA-256 does not match the approved asset');
  return inspectGlb(bytes);
}
/** One approved same-origin file only. No Git, arbitrary URLs, dependencies or decoders. */
export async function fetchModelBytes(input:ModelAsset,signal:AbortSignal,base:string,transport:typeof fetch=fetch):Promise<Uint8Array> {
  const asset=validateModelAsset(input),page=new URL(base),url=new URL(asset.path,new URL('./',page));
  if(!['http:','https:'].includes(page.protocol)||url.origin!==page.origin)throw new Error('Model needs a same-origin HTTP site');
  const timeout=AbortSignal.timeout(15000),combined=AbortSignal.any([signal,timeout]);combined.throwIfAborted();
  const response=await transport(url.href,{signal:combined,credentials:'omit',redirect:'error',mode:'same-origin',referrerPolicy:'no-referrer'});
  if(!response.ok||response.redirected)throw new Error('Model request failed or redirected');
  if(response.url&&response.url!==url.href)throw new Error('Model response URL changed');
  if(Number(response.headers.get('content-length'))>asset.byteLength)throw new Error('Model response exceeds its approved size');
  if(!response.body)throw new Error('Model response body is unavailable');
  const reader=response.body.getReader(),result=new Uint8Array(asset.byteLength);let offset=0;
  try {
    while(true){combined.throwIfAborted();const {done,value}=await reader.read();if(done)break;if(offset+value.length>result.length)throw new Error('Model stream exceeds its approved size');result.set(value,offset);offset+=value.length;}
    combined.throwIfAborted();if(offset!==result.length)throw new Error('Truncated model response');return result;
  } catch(error){await reader.cancel().catch(()=>{});throw error;} finally{reader.releaseLock();}
}
