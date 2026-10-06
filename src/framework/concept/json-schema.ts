/**
 * JSON Schema (draft 2020-12) export of the concept spec zod schema, so editors and other tools can validate
 * files without this code. Only the zod features the schema uses are translated; cross-references
 * (ids that must exist, heights that must increase) are documented in `description` and enforced by
 * `checkConceptSpec`.
 */
import {z} from 'zod';
import {conceptSpecSchema,CONCEPT_FORMAT} from './schema.ts';

type Json={[k:string]:unknown};
function convert(schema:z.ZodTypeAny):Json{
  const def=schema._def as {typeName:string;[k:string]:unknown},out:Json={};
  if(schema.description)out.description=schema.description;
  switch(def.typeName){
    case 'ZodEffects':return {...convert(def.schema as z.ZodTypeAny),...out};
    case 'ZodOptional':return {...convert(def.innerType as z.ZodTypeAny),...out};
    case 'ZodString':{
      out.type='string';
      for(const c of def.checks as {kind:string;value?:number;regex?:RegExp}[]){
        if(c.kind==='min')out.minLength=c.value;else if(c.kind==='max')out.maxLength=c.value;else if(c.kind==='regex')out.pattern=c.regex!.source;
      }
      return out;
    }
    case 'ZodNumber':{
      out.type='number';
      for(const c of def.checks as {kind:string;value?:number;inclusive?:boolean}[]){
        if(c.kind==='min')out[c.inclusive?'minimum':'exclusiveMinimum']=c.value;else if(c.kind==='max')out[c.inclusive?'maximum':'exclusiveMaximum']=c.value;else if(c.kind==='int')out.type='integer';
      }
      return out;
    }
    case 'ZodEnum':return {...out,enum:[...(def.values as string[])]};
    case 'ZodLiteral':return {...out,const:def.value};
    case 'ZodArray':{
      out.type='array';out.items=convert(def.type as z.ZodTypeAny);
      if(def.minLength)out.minItems=(def.minLength as {value:number}).value;
      if(def.maxLength)out.maxItems=(def.maxLength as {value:number}).value;
      return out;
    }
    case 'ZodObject':{
      const shape=(schema as z.AnyZodObject).shape as Record<string,z.ZodTypeAny>;
      out.type='object';out.additionalProperties=def.unknownKeys!=='strict'?true:false;
      out.required=Object.entries(shape).filter(([,v])=>!v.isOptional()).map(([k])=>k);
      out.properties=Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,convert(v)]));
      return out;
    }
    default:throw new Error('Concept JSON Schema: unsupported zod type '+def.typeName);
  }
}
const root=convert(conceptSpecSchema);
export const conceptSpecJsonSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://datapass.local/contracts/concept-spec.schema.json',
  title:'DataPass concept spec v1',
  description:`One renderer-free description of an app or a cloud project (format "${CONCEPT_FORMAT}", version 1). `
    +'Layers are listed bottom to top with strictly increasing heights (gap ≥ 0.6); every id is unique across the document; '
    +'node.layer, node.domain, flow.from, flow.to and annotation.target must name declared ids; at most one lake, on the bottom layer; '
    +'at most 3 nodes per (layer, domain) cell; side domains come after main domains; a documented spec cites a source for every node.',
  ...root
};
