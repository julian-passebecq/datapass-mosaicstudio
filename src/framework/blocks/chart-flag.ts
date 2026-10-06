/** "One chart path" switch (architect verdict, 2026-10-05): the chart block routes through the
 * viz kit when this flag is on. Default OFF (flipping it is a later package). A block's own
 * `renderer: 'viz' | 'vizforge'` overrides the flag for that block (chartUsesViz).
 * Turn on per build with VITE_DP_VIZ_CHART=1, per page load with `?viz-chart=1`, or per document
 * with `<html data-viz-chart="on">`.
 */
export function vizChartEnabled(
  env:{VITE_DP_VIZ_CHART?:string}|undefined=(import.meta as unknown as {env?:{VITE_DP_VIZ_CHART?:string}}).env,
  location:{search:string}|undefined=globalThis.location,
  root:{dataset?:Record<string,string|undefined>}|undefined=globalThis.document?.documentElement,
):boolean{
  if(env?.VITE_DP_VIZ_CHART==='1')return true;
  if(root?.dataset?.vizChart==='on')return true;
  if(!location)return false;
  return new URLSearchParams(location.search).get('viz-chart')==='1';
}
/** Path for one chart block: its own `renderer` wins; without it the flag above decides. */
export function chartUsesViz(block:{renderer?:'viz'|'vizforge'},flag:()=>boolean=vizChartEnabled):boolean{
  if(block.renderer==='viz')return true;
  if(block.renderer==='vizforge')return false;
  return flag();
}
