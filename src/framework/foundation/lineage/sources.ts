import {validateSources,type SourceArtifact} from '../../evidence/model.ts';
import type {Artifact} from '../artifact.ts';
import {artifactEvidence} from './model.ts';

/** Cited files are published beside the page as inert text: `<directory><path>.txt` (written by datapass_artifact.write_sources). */
export const SOURCE_DIRECTORY='sources/';
type FetchLike=(url:string,init?:{signal?:AbortSignal;credentials?:'same-origin';cache?:'no-cache'})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
const LANGUAGES:Record<string,SourceArtifact['language']>={py:'python',sql:'sql',ts:'typescript',tsx:'typescript',json:'json',md:'markdown'};
export const sourceLanguage=(path:string):SourceArtifact['language']=>LANGUAGES[path.split('.').at(-1)??'']??'text';

/**
 * Fetch the text of every file the artifact cites (same origin only) and validate it with the SourceArtifact
 * contract. Missing files are reported, not invented; the panel then says the source was not supplied.
 */
export async function loadEvidenceSources(artifact:Artifact,options:{base:string;fetch?:FetchLike;signal?:AbortSignal;directory?:string}):Promise<{sources:SourceArtifact[];missing:string[]}>{
  const fetcher=options.fetch??(globalThis.fetch as unknown as FetchLike),directory=options.directory??SOURCE_DIRECTORY;
  const paths=[...new Set(artifactEvidence(artifact).map(ref=>ref.path))];
  const found:SourceArtifact[]=[],missing:string[]=[];
  await Promise.all(paths.map(async(path,index)=>{
    const url=new URL(directory+path.split('/').map(encodeURIComponent).join('/')+'.txt',new URL('./',options.base));
    if(url.origin!==new URL(options.base).origin){missing.push(path);return;}
    try{
      const response=await fetcher(url.href,{signal:options.signal,credentials:'same-origin',cache:'no-cache'});
      if(!response.ok){missing.push(path);return;}
      found[index]={id:'source-'+index,path,language:sourceLanguage(path),title:path,text:(await response.text()).replace(/\r\n/g,'\n'),provenance:'provided'};
    }catch(error){if((error as Error)?.name==='AbortError')throw error;missing.push(path);}
  }));
  return {sources:validateSources(found.filter(Boolean)),missing:missing.sort()};
}
