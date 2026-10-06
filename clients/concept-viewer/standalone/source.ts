/**
 * Where the standalone viewer may read a spec from by URL (`?src=` or the URL box). Pure, unit-tested.
 * Allowed: https:// anywhere, http:// only on the local machine (localhost, 127.0.0.1). No credentials in
 * the URL. The fetch sends no cookies and no referrer; the server must allow cross-origin reads (CORS), because a
 * page opened from file:// has the opaque origin "null".
 */
import {CONCEPT_LIMITS} from '../../../src/framework/concept/schema.ts';

export type UrlCheck={ok:true;url:string}|{ok:false;message:string};
const LOCAL=new Set(['localhost','127.0.0.1']);
export function checkSpecUrl(value:string|null):UrlCheck{
  const text=(value??'').trim();
  if(!text)return {ok:false,message:'is empty'};
  if(text.length>2000)return {ok:false,message:'is longer than 2000 characters'};
  let url:URL;
  try{url=new URL(text);}catch{return {ok:false,message:'is not an absolute URL (expected https://…)'};}
  if(url.username||url.password)return {ok:false,message:'must not contain a user name or password'};
  if(url.protocol==='https:')return {ok:true,url:url.href};
  if(url.protocol==='http:'&&LOCAL.has(url.hostname))return {ok:true,url:url.href};
  return {ok:false,message:`must use https:// (or http:// on localhost); "${url.protocol}" is not allowed`};
}

/** Reads the URL as text with the same 256 KB bound as files, and turns network failures into an actionable message. */
export async function fetchSpecText(url:string,fetcher:typeof fetch=fetch):Promise<string>{
  let r:Response;
  try{r=await fetcher(url,{credentials:'omit',mode:'cors',referrerPolicy:'no-referrer',cache:'no-store'});}
  catch{throw new Error(`could not read ${url}: the server is unreachable or does not allow cross-origin reads (it must send Access-Control-Allow-Origin, e.g. "*"). If the file is on this computer, drop it on the page instead.`);}
  if(!r.ok)throw new Error(`HTTP ${r.status} for ${url}`);
  const size=Number(r.headers.get('content-length')??0);
  if(size>CONCEPT_LIMITS.bytes)throw new Error(`file is larger than ${CONCEPT_LIMITS.bytes/1024} KB`);
  return r.text();
}
