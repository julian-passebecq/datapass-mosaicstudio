import {createElement,lazy,Suspense} from 'react';
/** Plain-TS entry for the client-owned engineering consumer: app.ts stays importable by Node tests (no .tsx at load) and
 * the consumer is a separate chunk. Not a renderer, store or scheduler. */
const Consumer=lazy(()=>import('./EngineeringConsumer.tsx').then(m=>({default:m.EngineeringConsumer})));
export function EngineeringConsumerEntry(){
  return createElement(Suspense,{fallback:createElement('p',{role:'status','data-capture-state':'busy'},'Loading engineering consumer...')},createElement(Consumer));
}
