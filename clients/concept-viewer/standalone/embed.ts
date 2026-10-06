/**
 * Embed API of the standalone viewer (used when a host page such as Contoso iframes it).
 *
 *   parent -> viewer  {type: "datapass.concept-spec/load", spec}   spec: the concept object, or its JSON text
 *   viewer -> parent  {type: "datapass.concept-spec/ready", ...}    once listening, then again after each load
 *                     with `result`: {ok: true, id, warnings} or {ok: false, issues}
 *
 * Only messages from the direct parent window with exactly that `type` are read. The spec is data: it goes through
 * the same bounded JSON + validation path as "Open file" and nothing in it is evaluated.
 */
import {CONCEPT_LIMITS,CONCEPT_SPEC_VERSION} from '../../../src/framework/concept/schema.ts';

export const EMBED_LOAD='datapass.concept-spec/load';
export const EMBED_READY='datapass.concept-spec/ready';

/** The JSON text of a load message, or null for any other message (ignored without a reply). */
export function embeddedSpecText(data:unknown):string|null{
  if(!data||typeof data!=='object'||(data as {type?:unknown}).type!==EMBED_LOAD)return null;
  const spec=(data as {spec?:unknown}).spec;
  if(typeof spec==='string')return spec;
  try{const text=JSON.stringify(spec===undefined?null:spec);return text.length>CONCEPT_LIMITS.bytes?' '.repeat(CONCEPT_LIMITS.bytes+1):text;}
  catch{return 'not JSON';}
}
export function readyMessage(result?:{ok:boolean;[k:string]:unknown}){
  return {type:EMBED_READY,specVersion:CONCEPT_SPEC_VERSION,...(result?{result}:{})};
}
