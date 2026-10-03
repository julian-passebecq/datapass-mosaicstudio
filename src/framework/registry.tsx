import {lazy,type ComponentType} from 'react';
import type {Block} from './types';
import {useRuntime} from './hooks';
import Basic from './blocks/Basic';
import type {SiteRuntime} from './runtime';
const Runs=__STUDIO_RUNS__?lazy(()=>import('./foundation/RunWorkbench')):null;
export const SharedRunScope=__STUDIO_RUNS__?lazy(()=>import('./foundation/RunScope').then(m=>({default:m.RunScope}))):function MissingRuns(_: {ids:string[];children:import('react').ReactNode}){throw new Error('Run capability was not included in this build');};
const Model=__STUDIO_MODELS__?lazy(()=>import('./model-assets/Model')):null;
const Chart=__STUDIO_CHARTS__?lazy(()=>import('./blocks/Chart')):null;
const Scene=__STUDIO_3D__?lazy(()=>import('./blocks/Scene3D')):null;
const Story=__STUDIO_STORIES__?lazy(()=>import('./blocks/Story')):null;
const Motion=__STUDIO_MOTION__?lazy(()=>import('./motion/Motion')):null;
export const SharedMotionScope=__STUDIO_MOTION__?lazy(()=>import('./motion/Scope').then(m=>({default:m.MotionScope}))):function MissingMotion(_: {blocks:import('./motion/model').MotionBlock[];children:import('react').ReactNode}){throw new Error('Motion was not included in this build');};
const Replay=__STUDIO_REPLAY__?lazy(()=>import('./replay/Replay')):null;
export const SharedReplayScope=__STUDIO_REPLAY__?lazy(()=>import('./replay/Scope').then(m=>({default:m.ReplayScope}))):function MissingReplay(_: {blocks:import('./replay/model').ReplayBlock[];children:import('react').ReactNode}){throw new Error('Replay was not included in this build');};
const Explorer=__STUDIO_EXPLORER__?lazy(()=>import('./explorer/Explorer')):null;
const Explanation=__STUDIO_EXPLANATIONS__?lazy(()=>import('./blocks/Explanation')):null;
const Architecture=__STUDIO_ARCHITECTURE__?lazy(()=>import('./blocks/Architecture')):null;
export const SharedStoryScope=__STUDIO_STORIES__?lazy(()=>import('./blocks/Story').then(m=>({default:m.StoryScope}))):function MissingStory(_: {ids:string[];children:import('react').ReactNode}){throw new Error('Story capability was not included in this client build');};
export type CustomBlockProps={runtime:SiteRuntime};
/** Built-ins are lazy. Custom resource ids resolve only to trusted source registrations. */
export function RenderBlock({block}:{block:Block}){
  const runtime=useRuntime();
  switch(block.type){
    case 'runs':if(!Runs)throw new Error('Run history not included in build');return <Runs resource={block.resource}/>;
    case 'model3d':if(!Model)throw new Error('Models not included in build');return <Model block={block}/>;
    case 'motion':if(!Motion)throw new Error('Motion not included in build');return <Motion block={block}/>;
    case 'chart':if(!Chart)throw new Error('Chart not included in build');return <Chart block={block}/>;
    case 'scene3d':if(!Scene)throw new Error('3D not included in build');return <Scene block={block}/>;
    case 'story-controls':case 'story-figure':if(!Story)throw new Error('Story not included in build');return <Story block={block}/>;
    case 'architecture':if(!Architecture)throw new Error('Architecture not included in build');return <Architecture block={block}/>;
    case 'replay':if(!Replay)throw new Error('Replay not included in build');return <Replay block={block}/>;
    case 'explorer':if(!Explorer)throw new Error('Explorer not included in build');return <Explorer block={block}/>;
    case 'explanation':if(!Explanation)throw new Error('Explanation not included in build');return <Explanation block={block}/>;
    case 'custom':{const Component=runtime.definition.components?.[block.resource] as ComponentType<CustomBlockProps>;if(typeof Component!=='function')throw new Error('Trusted custom component unavailable');return <Component runtime={runtime}/>;}
    default:return <Basic block={block}/>;
  }
}
