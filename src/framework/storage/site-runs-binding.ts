/** F206 durable site runs: the trusted `AppDefinition.durableRuns` binding and its cell-id rule.
 * No fetch, browser storage or React here, so `validate.ts` can check a definition without loading a client. */
import {identifier,object} from '../guards.ts';
import type {RuntimeLink,RuntimeTask} from '../compute/runtime-task.ts';

/** Client-site runs share the ResultStore with the notebook under `site-<appId>-<taskId>` (never a notebook cell id). */
export const SITE_CELL_PREFIX='site-';
const CELL_ID=/^[a-z][a-zA-Z0-9_-]{0,79}$/;

/** The store cell id of one site task. Throws when the ids do not fit the store's 80-character cell id. */
export function siteCellId(appId:string,taskId:string):string{
  identifier(appId,'app id');identifier(taskId,'task id');
  const id=`${SITE_CELL_PREFIX}${appId}-${taskId}`;
  if(!CELL_ID.test(id))throw new Error(`Durable runs: "${id}" is longer than the result store's 80-character cell id; shorten the app or task id.`);
  return id;
}

/** Opt-in per run resource. Only runtime-produced tasks are durable: each handle's handler must be the task's
 * trusted binding, so a browser SiteRuntime task can never be saved as if a runtime had produced it. */
export type DurableRunsBinding={link:RuntimeLink;tasks:readonly RuntimeTask[]};

export function validateDurableRunsBindings(bindings:unknown,context:{appId:string;runResources:Readonly<Record<string,readonly string[]>>;taskBindings:Readonly<Record<string,unknown>>}):void{
  if(bindings===undefined)return;
  if(!object(bindings)||Object.keys(bindings).length>10)throw new Error('Invalid durable runs bindings');
  for(const [id,binding] of Object.entries(bindings)){
    const tasks=context.runResources[id];
    if(!tasks)throw new Error('Durable runs name an unused run resource: '+id);
    if(!object(binding)||Object.keys(binding).some(k=>k!=='link'&&k!=='tasks'))throw new Error('Durable runs binding: expected {link, tasks}');
    const link=binding.link as Record<string,unknown>|null;
    if(!link||typeof link!=='object'||['get','connect','pending','clear'].some(k=>typeof link[k]!=='function'))throw new Error('Durable runs require a trusted runtime link (createRuntimeLink)');
    if(!Array.isArray(binding.tasks)||!binding.tasks.length||binding.tasks.length>10)throw new Error('Durable runs need 1 to 10 runtime tasks');
    const seen=new Set<string>();
    for(const task of binding.tasks as unknown[]){
      const t=task as Record<string,unknown>|null;
      if(!t||typeof t!=='object'||typeof t.taskId!=='string'||typeof t.model!=='string'||['handler','latest','subscribe'].some(k=>typeof t[k]!=='function'))throw new Error('Durable runs: each task must be a runtime task handle (createRuntimeTask)');
      if(!tasks.includes(t.taskId))throw new Error(`Durable runs: task ${t.taskId} is not observed by run resource ${id}`);
      if(context.taskBindings[t.taskId]!==t.handler)throw new Error(`Durable runs: task ${t.taskId} is not bound to its runtime task handler; only runtime-produced runs are durable`);
      if(seen.has(t.taskId))throw new Error('Durable runs: duplicate task '+t.taskId);
      seen.add(t.taskId);siteCellId(context.appId,t.taskId);
    }
  }
}
