import type {TaskContext,Rows} from './types.ts';
export type JsonTaskOptions={endpoint:string;maxRequestBytes?:number;maxResponseBytes?:number;fetcher?:typeof fetch};
/** Optional same-origin JSON transport for a trusted computation service.
 * No URL or handler is ever read from an imported manifest/state file.
 * Caller must disclose the service and data sent. The server must validate,
 * authorize, limit and execute its own allowlisted calculation independently.
 */
export function createJsonTask({endpoint,maxRequestBytes=32768,maxResponseBytes=2*1024*1024,fetcher=globalThis.fetch}:JsonTaskOptions){
  if(typeof endpoint!=='string'||!/^api\/[a-zA-Z0-9_/-]+$/.test(endpoint)||endpoint.includes('//')||endpoint.endsWith('/')||endpoint.split('/').some(s=>s==='.'||s==='..'))throw new Error('Task endpoint must be a fixed relative api/path');
  for(const n of [maxRequestBytes,maxResponseBytes])if(!Number.isSafeInteger(n)||n<1||n>8*1024*1024)throw new Error('Task transport byte limit must be between 1 and 8 MiB');
  if(typeof fetcher!=='function')throw new Error('No fetch implementation');
  return async(context:TaskContext):Promise<Rows>=>{
    if(context.signal.aborted)throw new Error('Task cancelled');
    const body=JSON.stringify({values:context.values,datasets:context.datasets});
    if(new TextEncoder().encode(body).byteLength>maxRequestBytes)throw new Error('Task request exceeds its byte budget');
    const response=await fetcher('./'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body,signal:context.signal,credentials:'same-origin',redirect:'error',cache:'no-store'});
    if(!response.ok)throw new Error('Computation service returned HTTP '+response.status);
    if(!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw new Error('Computation service did not return JSON');
    const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>maxResponseBytes){await response.body?.cancel();throw new Error('Task response exceeds its byte budget');}
    if(!response.body)throw new Error('Computation service returned an empty body');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.byteLength;if(bytes>maxResponseBytes){await reader.cancel();throw new Error('Task response exceeds its byte budget');}chunks.push(result.value);if(context.signal.aborted){await reader.cancel();throw new Error('Task cancelled');}}}finally{reader.releaseLock();}
    const merged=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
    const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(merged));
    if(!Array.isArray(parsed))throw new Error('Computation service must return a row array');
    // The runtime validates every column, key and cell against the output dataset.
    return parsed as Rows;
  };
}
