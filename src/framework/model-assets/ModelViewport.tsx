import {useCallback,useMemo} from 'react';
import SceneViewport from '../scene-renderer/SceneViewport.tsx';
import type {SceneSpec} from '../scene.ts';
import {prepareModel} from './prepare.ts';
import type {ModelSpec,ModelState} from './model.ts';
import '../blocks/scene3d.css';

export default function ModelViewport({spec,state,onSelect}:{spec:ModelSpec;state:ModelState;onSelect(id:string):void}) {
  const scene=useMemo<SceneSpec>(()=>({format:'datapass.scene3d',version:1,title:spec.title,note:spec.note,entities:spec.parts.map(p=>({id:p.id,label:p.label,description:p.description})),parts:[],cameras:structuredClone(spec.cameras)}),[spec]);
  const load=useCallback((signal:AbortSignal)=>prepareModel(spec,signal),[spec]);
  return <SceneViewport scene={scene} loadContent={load} view={{selection:state.selection,camera:state.camera,explode:state.mode==='exploded'?state.explode:0,phase:0,mode:state.mode,section:state.section}} onSelect={onSelect} fileName="model" anchors={state.annotations?spec.annotations.map(a=>({entity:a.part,label:a.label})):[]} pageScroll/>;
}
