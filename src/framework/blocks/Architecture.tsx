import {useMemo} from 'react';
import ArchitectureReview from '../../panels/Architecture';
import {validateArchitecture} from '../../architecture/model';
import {useRuntime, useSiteState} from '../hooks';
import type {Block} from '../types';
import '@xyflow/react/dist/style.css';
export default function ArchitectureBlock({block}:{block:Extract<Block,{type:'architecture'}>}){
  const runtime=useRuntime(),snapshot=useSiteState();
  const doc=useMemo(()=>validateArchitecture(runtime.definition.resources!.architectures![block.resource]),[runtime,block.resource]);
  // Optional shared selection: one view select field ('none' = nothing selected) that other blocks may also read and write.
  const field=block.selection?runtime.definition.manifest.fields.find(f=>f.id===block.selection):undefined;
  const selectable=useMemo(()=>field?.options?.map(o=>o.value).filter(v=>v!=='none'),[field]);
  if(!field)return <div className="site-architecture"><ArchitectureReview initialDocument={doc}/></div>;
  const value=String(snapshot.values[field.id]);
  return <div className="site-architecture" data-selection={value}><ArchitectureReview initialDocument={doc} selectable={selectable} selection={value==='none'?null:value} onSelectionChange={id=>runtime.set(field.id,id??'none')}/></div>;
}
