import type {Manifest,Values,Field} from './types.ts';
/** Bind a semantic selection to ONE existing runtime view field, never to a renderer store.
 * Visibility/filtering belongs to a projection and does not alter this identity.
 */
export function selectionField(manifest:Manifest,fieldId:string):Field {
  const field=manifest.fields.find(field=>field.id===fieldId);
  if(!field||field.role!=='view'||field.type!=='select')throw new Error(`Selection "${fieldId}" must name an existing view/select field; declare its semantic IDs in manifest.fields.`);
  return field;
}
export function readSelection(manifest:Manifest,values:Values,fieldId:string):string {
  const field=selectionField(manifest,fieldId),value=values[fieldId];
  if(typeof value!=='string'||!field.options?.some(option=>option.value===value))throw new Error(`Unknown semantic selection in "${fieldId}". Use a declared option, not a label or renderer index.`);
  return value;
}
