import {memo,useEffect,useMemo} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,Handle,Position,MarkerType,useReactFlow,type Node,type NodeProps} from '@xyflow/react';
import type {ExplorerSpec,ExplorerState,ExplorerItem} from './model';
import {isInBranch} from './navigation';
import '@xyflow/react/dist/style.css';
type ItemData={item:ExplorerItem;active:boolean;dimmed:boolean};
const Card=memo(function Card({data}:NodeProps<Node<ItemData>>){return <div className={'explorer-map-node'+(data.active?' active':'')+(data.dimmed?' dimmed':'')}><Handle type="target" position={Position.Top}/><small>{data.item.kind}</small><strong>{data.item.label}</strong><p>{data.item.summary}</p><Handle type="source" position={Position.Bottom}/></div>;});
const nodeTypes={item:Card};
function Canvas({spec,state,onSelect,reduced}:{spec:ExplorerSpec;state:ExplorerState;onSelect(id:string):void;reduced:boolean}){
  const flow=useReactFlow();
  const items=useMemo(()=>spec.items.filter(i=>state.group==='all'||i.group===state.group),[spec,state.group]);
  const nodes:Node<ItemData>[]=items.map(item=>({id:item.id,type:'item',position:{x:item.position[0],y:item.position[1]},data:{item,active:item.id===state.focus,dimmed:state.focus!=='overview'&&!isInBranch(spec,item.id,state.focus)&&!isInBranch(spec,state.focus,item.id)},ariaLabel:item.label}));
  const edges=items.filter(i=>i.parent&&items.some(p=>p.id===i.parent)).map(i=>({id:'parent-'+i.id,source:i.parent!,target:i.id,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:'var(--explorer-line)',strokeWidth:1.5}}));
  useEffect(()=>{
    const target=spec.items.find(i=>i.id===state.focus);
    const timer=requestAnimationFrame(()=>{
      if(target)void flow.setCenter(target.position[0]+96,target.position[1]+48,{zoom:state.level==='evidence'?1:.88,duration:reduced?0:420});
      else void flow.fitView({padding:.18,duration:reduced?0:420,maxZoom:1});
    });return()=>cancelAnimationFrame(timer);
  },[state.focus,state.level,state.group,spec,flow,reduced]);
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.18,maxZoom:1}} minZoom={.2} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} zoomOnScroll={false} panOnScroll={false} preventScrolling={false} onNodeClick={(_,node)=>onSelect(node.id)}><Background color="var(--explorer-line)" gap={24}/><Controls showInteractive={false}/></ReactFlow>;
}
export default function MapView(props:{spec:ExplorerSpec;state:ExplorerState;onSelect(id:string):void;reduced:boolean}){return <div className="explorer-map" aria-label="Component relationship map"><ReactFlowProvider><Canvas {...props}/></ReactFlowProvider><small className="explorer-map-note">Authored relationships. Scroll moves the page; use + / - to zoom the diagram.</small></div>;}
