import {lazy,Suspense,useMemo} from 'react';
import {Figure} from '@vizforge/adapters/react';
import {parseVisualization} from '@vizforge/core/spec';
import type {Block} from '../types';
import {useDataset,useRuntime,useReducedMotion} from '../hooks';
import {chartInput} from '../chart-input';
import {withSiteChartTheme} from '../visual-theme';
import {chartUsesViz} from './chart-flag';
/** Viz-kit path (one chart path, the default). Lazy, so an opted-out VizForge page does not pay for it. */
const ChartViz=lazy(()=>import('./ChartViz.tsx'));
type ChartBlock=Extract<Block,{type:'chart'}>;
export default function Chart({block}:{block:ChartBlock}){
  // `renderer` on the block wins; without it the build/page flag decides (default: viz kit).
  if(chartUsesViz(block))return <Suspense fallback={<div className="site-loading" role="status">Loading chart...</div>}><ChartViz block={block}/></Suspense>;
  return <LegacyChart block={block}/>;
}
function LegacyChart({block}:{block:ChartBlock}){
  const runtime=useRuntime(),result=useDataset(block.dataset),reduced=useReducedMotion(),dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset)!;
  const input=useMemo(()=>chartInput(block,dataset,result.rows||[]),[block,dataset,result.rows]);
  const spec=useMemo(()=>input.input?parseVisualization(withSiteChartTheme(input.input,runtime.manifest.theme)):null,[input.input,runtime.manifest.theme]);
  if(result.error||input.note||!spec)return <div className="site-notice" role="status">{result.error||input.note||'No rows to plot.'}</div>;
  return <div className="site-viz" data-theme={runtime.manifest.theme.mode||'light'}><Figure spec={spec} options={{reducedMotion:reduced,animate:!reduced}}/></div>;
}
