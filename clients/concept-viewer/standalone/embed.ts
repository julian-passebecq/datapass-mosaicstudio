/**
 * Embed API of the standalone viewer (used when a host page such as Contoso iframes it).
 *
 *   parent -> viewer  {type: "datapass.concept-spec/load", spec, options?}   spec: the concept object, or its JSON text
 *                     options (all optional, since 0.8.1): {view: "isometric"|"layered"|"3d", fit: boolean,
 *                     chrome: "full"|"embed", theme: "light"|"dark"|"auto"}; unknown or invalid values are ignored
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
export type EmbedOptions={view?:'isometric'|'layered'|'3d';fit?:boolean;chrome?:'full'|'embed';theme?:'light'|'dark'|'auto'};
const OPTION_VALUES={view:['isometric','layered','3d'],chrome:['full','embed'],theme:['light','dark','auto']} as const;
/** The valid display options of a load message (an empty object when there are none). Never throws. */
export function embedOptions(data:unknown):EmbedOptions{
  const raw=data&&typeof data==='object'?(data as {options?:unknown}).options:undefined;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const o=raw as Record<string,unknown>,out:EmbedOptions={};
  for(const key of ['view','chrome','theme'] as const){const v=o[key];if(typeof v==='string'&&(OPTION_VALUES[key] as readonly string[]).includes(v))(out as Record<string,string>)[key]=v;}
  if(typeof o.fit==='boolean')out.fit=o.fit;
  return out;
}
export function readyMessage(result?:{ok:boolean;[k:string]:unknown}){
  return {type:EMBED_READY,specVersion:CONCEPT_SPEC_VERSION,...(result?{result}:{})};
}
