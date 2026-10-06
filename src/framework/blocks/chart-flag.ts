/** "One chart path" switch (architect verdict, 2026-10-05; default flipped in FW-VIZ-HEADROOM,
 * 2026-10-06): the chart block routes through the viz kit by default. A block's own
 * `renderer: 'viz' | 'vizforge'` overrides the default for that block (chartUsesViz), so
 * `renderer: 'vizforge'` is the per-block opt-out.
 * Global opt-out (back to VizForge for blocks without `renderer`): per build with
 * VITE_DP_VIZ_CHART=0, per page load with `?viz-chart=0`, or per document with
 * `<html data-viz-chart="off">`. The former opt-ins (`=1`, `on`) are still accepted.
 */
export function vizChartEnabled(
  env:{VITE_DP_VIZ_CHART?:string}|undefined=(import.meta as unknown as {env?:{VITE_DP_VIZ_CHART?:string}}).env,
  location:{search:string}|undefined=globalThis.location,
  root:{dataset?:Record<string,string|undefined>}|undefined=globalThis.document?.documentElement,
):boolean{
  const page=location?new URLSearchParams(location.search).get('viz-chart'):null;
  if(page==='0')return false;
  if(page==='1')return true;
  if(root?.dataset?.vizChart==='off')return false;
  if(root?.dataset?.vizChart==='on')return true;
  return env?.VITE_DP_VIZ_CHART!=='0';
}
/** Path for one chart block: its own `renderer` wins; without it the default above decides. */
export function chartUsesViz(block:{renderer?:'viz'|'vizforge'},flag:()=>boolean=vizChartEnabled):boolean{
  if(block.renderer==='viz')return true;
  if(block.renderer==='vizforge')return false;
  return flag();
}
