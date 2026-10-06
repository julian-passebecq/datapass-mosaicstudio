/** ChartSpec zod schema: the reference contract for tooling (contracts, editors, docs, the parity
 * test). The runtime hot path (`parseChartSpec`) uses the zod-free checker in spec.ts so the viz
 * core bundle stays small; tests/viz-spec-parity.test.mjs keeps both in lockstep.
 * Import from here (or `viz/schema`), never from the core barrel.
 */
import {z} from 'zod';
import {MARKS,ID_PATTERN,SPEC_LIMITS,ENUMS,type ChartSpec} from './spec-shape.ts';

const id=z.string().regex(ID_PATTERN,'column id');
const channel=z.object({field:id,title:z.string().max(SPEC_LIMITS.channelTitle).optional(),format:z.string().max(SPEC_LIMITS.channelFormat).optional()}).strict();
export const chartSpecSchema=z.object({
  id:id,
  title:z.string().max(SPEC_LIMITS.title).optional(),
  mark:z.enum(MARKS),
  encoding:z.object({
    x:channel.optional(),y:channel.optional(),z:channel.optional(),color:channel.optional(),size:channel.optional(),
    series:channel.optional(),theta:channel.optional(),tooltip:z.array(channel).max(SPEC_LIMITS.tooltip).optional(),
  }).strict(),
  stack:z.enum(ENUMS.stack).optional(),
  sort:z.enum(ENUMS.sort).optional(),
  format:z.object({unit:z.string().max(SPEC_LIMITS.unit).optional(),digits:z.number().int().min(0).max(SPEC_LIMITS.digits).optional(),compact:z.boolean().optional()}).strict().optional(),
  selection:z.object({field:id,mode:z.enum(ENUMS.selectionMode),on:id.optional()}).strict().optional(),
  renderer:z.enum(ENUMS.renderer).optional(),
}).strict();

/** Compile-time parity: the hand-written ChartSpec and the zod-inferred type are the same shape. */
type Same<A,B>=[A] extends [B]?([B] extends [A]?true:false):false;
const _sameType:Same<z.infer<typeof chartSpecSchema>,ChartSpec>=true;void _sameType;
