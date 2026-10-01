import {useMemo} from 'react';
import {Figure} from '@vizforge/adapters/react';
import {parseVisualization} from '@vizforge/core/spec';
import type {Block} from '../types';
import {useDataset,useRuntime,useReducedMotion} from '../hooks';
import {chartInput} from '../chart-input';
import {withSiteChartTheme} from '../visual-theme';
export default function Chart({block}:{block:Extract<Block,{type:'chart'}>}){
  const runtime=useRuntime(),result=useDataset(block.dataset),reduced=useReducedMotion(),dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset)!;
  const input=useMemo(()=>chartInput(block,dataset,result.rows||[]),[block,dataset,result.rows]);
  const spec=useMemo(()=>input.input?parseVisualization(withSiteChartTheme(input.input,runtime.manifest.theme)):null,[input.input,runtime.manifest.theme]);
  if(result.error||input.note||!spec)return <div className="site-notice" role="status">{result.error||input.note||'No rows to plot.'}</div>;
  return <div className="site-viz" data-theme={runtime.manifest.theme.mode||'light'}><Figure spec={spec} options={{reducedMotion:reduced,animate:!reduced}}/></div>;
}
