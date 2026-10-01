import {lazy,type ComponentType} from 'react';
import type {Block} from './types';
import {useRuntime} from './hooks';
import Basic from './blocks/Basic';
import type {SiteRuntime} from './runtime';
const Chart=__STUDIO_CHARTS__?lazy(()=>import('./blocks/Chart')):null;
const Scene=__STUDIO_3D__?lazy(()=>import('./blocks/Scene3D')):null;
const Story=__STUDIO_STORIES__?lazy(()=>import('./blocks/Story')):null;
const Architecture=__STUDIO_ARCHITECTURE__?lazy(()=>import('./blocks/Architecture')):null;
export const SharedStoryScope=__STUDIO_STORIES__?lazy(()=>import('./blocks/Story').then(m=>({default:m.StoryScope}))):function MissingStory(_: {ids:string[];children:import('react').ReactNode}){throw new Error('Story capability was not included in this client build');};
export type CustomBlockProps={runtime:SiteRuntime};
/** Built-ins are lazy. Custom resource ids resolve only to trusted source registrations. */
export function RenderBlock({block}:{block:Block}){
  const runtime=useRuntime();
  switch(block.type){
    case 'chart':if(!Chart)throw new Error('Chart not included in build');return <Chart block={block}/>;
    case 'scene3d':if(!Scene)throw new Error('3D not included in build');return <Scene block={block}/>;
    case 'story-controls':case 'story-figure':if(!Story)throw new Error('Story not included in build');return <Story block={block}/>;
    case 'architecture':if(!Architecture)throw new Error('Architecture not included in build');return <Architecture block={block}/>;
    case 'custom':{const Component=runtime.definition.components?.[block.resource] as ComponentType<CustomBlockProps>;if(typeof Component!=='function')throw new Error('Trusted custom component unavailable');return <Component runtime={runtime}/>;}
    default:return <Basic block={block}/>;
  }
}
