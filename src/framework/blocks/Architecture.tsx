import {useMemo} from 'react';
import ArchitectureReview from '../../panels/Architecture';
import {validateArchitecture} from '../../architecture/model';
import {useRuntime} from '../hooks';
import type {Block} from '../types';
import '@xyflow/react/dist/style.css';
export default function ArchitectureBlock({block}:{block:Extract<Block,{type:'architecture'}>}){
  const runtime=useRuntime();
  const doc=useMemo(()=>validateArchitecture(runtime.definition.resources!.architectures![block.resource]),[runtime,block.resource]);
  return <div className="site-architecture"><ArchitectureReview initialDocument={doc}/></div>;
}
