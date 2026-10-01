import {useMemo} from 'react';
import {ConceptScene} from '@conceptmotion/react';
import {compileLoopFrame} from '@conceptmotion/core';
import type {Block} from '../types';
import {validateExplanation} from '../explanation';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
/** Original semantic renderer. Manual authored frames, not a code runner or another autoplay clock. */
export default function Explanation({block}:{block:Extract<Block,{type:'explanation'}>}){
  const runtime=useRuntime(),state=useSiteState(),reduced=useReducedMotion();
  const resource=useMemo(()=>validateExplanation(runtime.definition.resources!.explanations![block.resource],runtime.manifest),[runtime,block.resource]);
  const index=Number(state.values[resource.frameField]),frame=useMemo(()=>compileLoopFrame(resource.spec,index),[resource,index]);
  function go(next:number){runtime.set(resource.frameField,Math.max(0,Math.min(resource.spec.frames.length-1,next)));}
  return <section className="site-explanation" aria-label={block.title||resource.spec.title} data-frame={index} data-engine="conceptmotion"><header><div><span className="site-kicker">Semantic explanation</span><h2>{block.title||resource.spec.title}</h2></div><div role="group" aria-label="Explanation frames"><button type="button" disabled={index===0} onClick={()=>go(index-1)}>Previous explanation frame</button><span>{index+1} / {resource.spec.frames.length}</span><button type="button" disabled={index===resource.spec.frames.length-1} onClick={()=>go(index+1)}>Next explanation frame</button></div></header>
    <div className="site-explanation-figure"><ConceptScene spec={resource.spec} frameIndex={index} reducedMotion={reduced} ariaLabel={resource.spec.title}/></div>
    <div className="site-explanation-caption" aria-live="polite"><strong>{frame.frame.operation}</strong><p>{String(frame.frame.caption)}</p></div>
    <details><summary>Read the steps without animation</summary><ol>{resource.spec.frames.map(f=><li key={f.id}><strong>{f.operation}</strong><p>{f.caption}</p></li>)}</ol></details><footer>{resource.note}<br/>Source: {resource.source}. Code is displayed, never executed.</footer>
  </section>;
}
