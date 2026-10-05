/** DataPass viz kit (N1): spec, renderer routing, tokens, motion, interaction and visuals.
 * d3 modules only (never the barrel). Canvas is used above RENDER_LIMITS.svg marks.
 */
export {DURATIONS,CURVES,cubicBezier,ease,Motion,VirtualClock,realClock,detectCapture,lerp} from './motion.ts';
export type {Clock,MotionOptions,Tween,DurationName,CurveName} from './motion.ts';
export {lightTokens,darkTokens,vizTokens,tokenVars,tokenCss,cat,v,resolveVars} from './tokens.ts';
export type {VizTokens,VizMode,TokenOverrides} from './tokens.ts';
export {chartSpecSchema,parseChartSpec,fromLegacyChart,specFromTable,missingEncoded,ChartSpecError,MARKS} from './spec.ts';
export type {ChartSpec,ArtifactTable} from './spec.ts';
export {estimateMarks,chooseRenderer,routeSpec,RENDER_LIMITS} from './route.ts';
export type {RendererId} from './route.ts';
export {formatNumber,tickCount} from './scales.ts';
export {VizRoot,useMotion,useMarkTransition,useCountUp,settledAttr} from './react.tsx';
export {useTooltip} from './Tooltip.tsx';
export {BarChart,LineChart,Donut,Heatmap,Legend,useSize} from './svg.tsx';
export type {BarProps,LineProps,LineSeries,DonutProps,HeatProps,NumberFormat} from './svg.tsx';
export {Kpi} from './Kpi.tsx';
export {Skeleton} from './Skeleton.tsx';
export {useMultiField,useIntervalField,passes,activeFilters,crossfilter,groupSum} from './interaction.ts';
export type {Filter} from './interaction.ts';
