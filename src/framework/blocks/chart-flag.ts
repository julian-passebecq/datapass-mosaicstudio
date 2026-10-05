/** "One chart path" switch (architect verdict, 2026-10-05): the chart block routes through the
 * viz kit when this flag is on. Default OFF until the remaining gaps are closed (see ChartViz.tsx).
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
