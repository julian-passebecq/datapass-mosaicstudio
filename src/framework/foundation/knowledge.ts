import {validateSources,validateEvidence,sourceLines,excerpt,type SourceArtifact,type EvidenceRef} from '../evidence/model.ts';
import {identifier,strict,text} from '../guards.ts';
import {boundedJson,freezeValue,integerRange,jsonBytes} from './safety.ts';

export type SourceSummary={sourceId:string;text:string};
export type SearchHit={sourceId:string;title:string;path:string;excerpt:string;reference:EvidenceRef};
export type ContextSelection={sourceId:string;mode:'full'|'summary'|'excerpt'|'excluded';references?:EvidenceRef[]};
export type ContextPayload={format:'datapass.context';version:1;entries:{sourceId:string;path:string;mode:Exclude<ContextSelection['mode'],'excluded'>;text:string;references:EvidenceRef[]}[];omitted:{sourceId:string;reason:'excluded'|'budget'}[]};
export type ContextBundle={payload:ContextPayload;byteLength:number};
export interface KnowledgeProvider{
  readonly id:string;
  readonly mode:'static'|'service';
  sources(signal?:AbortSignal):Promise<readonly SourceArtifact[]>;
  search(query:string,options?:{limit?:number;signal?:AbortSignal}):Promise<readonly SearchHit[]>;
  read(reference:EvidenceRef,signal?:AbortSignal):Promise<string>;
  context(selection:readonly ContextSelection[],maxBytes:number,signal?:AbortSignal):Promise<ContextBundle>;
}
function checkSignal(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Knowledge request cancelled','AbortError');}
/** Bounded lexical search and exact excerpts, not RAG, ingestion or automatic summarization. */
export class StaticKnowledgeProvider implements KnowledgeProvider{
  readonly id:string;
  readonly mode='static' as const;
  private readonly artifacts:readonly SourceArtifact[];
  private readonly summaries:ReadonlyMap<string,string>;
  constructor(id:string,sources:unknown,summaries:readonly SourceSummary[]=[]){
    identifier(id,'knowledge provider');this.id=id;this.artifacts=freezeValue(validateSources(sources));
    if(!Array.isArray(summaries)||summaries.length>24)throw new Error('Source summary budget');
    const seen=new Set<string>();for(const summary of summaries){strict(summary,['sourceId','text'],'source summary');identifier(summary.sourceId,'summary source');text(summary.text,'authored summary',4000);if(seen.has(summary.sourceId)||!this.artifacts.some(a=>a.id===summary.sourceId))throw new Error('Duplicate or unknown summary source');seen.add(summary.sourceId);}
    this.summaries=new Map(summaries.map(s=>[s.sourceId,s.text]));
  }
  async sources(signal?:AbortSignal){checkSignal(signal);return this.artifacts;}
  async search(query:string,options:{limit?:number;signal?:AbortSignal}={}){
    checkSignal(options.signal);text(query,'search query',200);const limit=options.limit??12;integerRange(limit,1,50,'search result limit');
    const needle=query.toLocaleLowerCase('en'),hits:SearchHit[]=[];
    for(const source of this.artifacts){
      const lines=sourceLines(source);
      for(let i=0;i<lines.length&&hits.length<limit;i++)if(lines[i].toLocaleLowerCase('en').includes(needle)){
        const reference={artifact:source.id,start:i+1,end:i+1,label:'Matched source line'};
        hits.push({sourceId:source.id,title:source.title,path:source.path,excerpt:lines[i],reference});
      }
      if(hits.length===limit)break;
    }
    checkSignal(options.signal);return freezeValue(hits);
  }
  async read(reference:EvidenceRef,signal?:AbortSignal){checkSignal(signal);return excerpt(this.artifacts,reference);}
  async context(selection:readonly ContextSelection[],maxBytes:number,signal?:AbortSignal):Promise<ContextBundle>{
    checkSignal(signal);integerRange(maxBytes,4096,65536,'context byte budget');boundedJson(selection,64000);
    if(!Array.isArray(selection)||selection.length>24)throw new Error('Context source limit');
    const seen=new Set<string>();
    const prepared=selection.map(choice=>{
      strict(choice,['sourceId','mode','references'],'context selection');identifier(choice.sourceId,'context source');
      const source=this.artifacts.find(s=>s.id===choice.sourceId);if(!source||seen.has(choice.sourceId))throw new Error('Duplicate or unknown context source');seen.add(choice.sourceId);
      if(typeof choice.mode!=='string'||!['full','summary','excerpt','excluded'].includes(choice.mode))throw new Error('Unknown context source mode');
      if(choice.mode!=='excerpt'&&choice.references!==undefined)throw new Error('Only excerpt mode accepts line references');
      let content='',refs:EvidenceRef[]=[];
      if(choice.mode==='full'){content=source.text;refs=[{artifact:source.id,start:1,end:sourceLines(source).length,label:'Complete source'}];}
      if(choice.mode==='summary'){const summary=this.summaries.get(source.id);if(summary===undefined)throw new Error('No authored summary is available');content=summary;}
      if(choice.mode==='excerpt'){
        if(!Array.isArray(choice.references)||!choice.references.length)throw new Error('Excerpt selection requires exact references');
        refs=validateEvidence(choice.references,this.artifacts);if(refs.some(r=>r.artifact!==source.id))throw new Error('Excerpt refers to another source');
        content=refs.map(ref=>excerpt(this.artifacts,ref)).join('\n\n');
      }
      return {source,mode:choice.mode as ContextSelection['mode'],content,refs};
    });
    // Reserve omission metadata first. Never silently truncate a cited excerpt to fit.
    let payload:ContextPayload={format:'datapass.context',version:1,entries:[],omitted:prepared.map(p=>({sourceId:p.source.id,reason:p.mode==='excluded'?'excluded':'budget'}))};
    for(const item of prepared){
      if(item.mode==='excluded')continue;
      const entry={sourceId:item.source.id,path:item.source.path,mode:item.mode,text:item.content,references:item.refs};
      const candidate:ContextPayload={...payload,entries:[...payload.entries,entry],omitted:payload.omitted.filter(o=>o.sourceId!==item.source.id)};
      if(jsonBytes(candidate)<=maxBytes)payload=candidate;
    }
    const byteLength=jsonBytes(payload);if(byteLength>maxBytes)throw new Error('Context metadata exceeds budget');
    checkSignal(signal);return freezeValue({payload,byteLength});
  }
}
