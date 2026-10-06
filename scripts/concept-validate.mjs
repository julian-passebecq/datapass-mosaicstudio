#!/usr/bin/env node
/**
 * Validate concept spec files against the published v1 contract (schema + cross-reference rules).
 *
 *   node scripts/concept-validate.mjs <file.concept.json> [more files…] [--strict] [--json]
 *
 * Exit 0 when every file is valid, 1 when one is invalid (or has warnings with --strict), 2 on bad usage.
 * Warnings (unknown fields ignored, missing or newer specVersion) never fail without --strict.
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

let schema;
try{schema=await import('../src/framework/concept/schema.ts');}
catch(e){
  // Node 22 before 22.18 needs the type-stripping flag for the .ts source: rerun once with it.
  if(e?.code!=='ERR_UNKNOWN_FILE_EXTENSION'||process.execArgv.includes('--experimental-strip-types'))throw e;
  const r=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit'});
  process.exit(r.status??1);
}
const {checkConceptSpec,CONCEPT_SPEC_VERSION,CONCEPT_LIMITS}=schema;

const args=process.argv.slice(2),strict=args.includes('--strict'),json=args.includes('--json');
const files=args.filter(a=>!a.startsWith('--'));
if(!files.length||args.some(a=>a.startsWith('--')&&a!=='--strict'&&a!=='--json')){
  console.error('Usage: node scripts/concept-validate.mjs <file.concept.json> [more files…] [--strict] [--json]');process.exit(2);
}
const results=[];
for(const file of files){
  let text;
  try{text=await readFile(file,'utf8');}catch(e){results.push({file,ok:false,issues:[{path:'',message:'cannot read file ('+e.code+')'}],warnings:[]});continue;}
  if(text.length>CONCEPT_LIMITS.bytes){results.push({file,ok:false,issues:[{path:'',message:`file is larger than ${CONCEPT_LIMITS.bytes/1024} KB`}],warnings:[]});continue;}
  let value;
  try{value=JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text);}catch(e){results.push({file,ok:false,issues:[{path:'',message:'not valid JSON ('+e.message+')'}],warnings:[]});continue;}
  const r=checkConceptSpec(value);
  results.push(r.ok?{file,ok:!(strict&&r.warnings.length),id:r.spec.id,counts:{layers:r.spec.layers.length,nodes:r.spec.nodes.length,flows:r.spec.flows.length},issues:[],warnings:r.warnings}:{file,ok:false,issues:r.issues,warnings:r.warnings});
}
if(json)console.log(JSON.stringify({specVersion:CONCEPT_SPEC_VERSION,strict,results},null,2));
else for(const r of results){
  console.log(`${r.ok?'OK  ':'FAIL'} ${r.file}${r.id?`  ${r.id} · ${r.counts.layers} layers, ${r.counts.nodes} nodes, ${r.counts.flows} flows`:''}`);
  for(const i of r.issues)console.log(`  error   ${i.path||'(file)'}: ${i.message}`);
  for(const w of r.warnings)console.log(`  warning ${w.path||'(file)'}: ${w.message}`);
}
process.exit(results.every(r=>r.ok)?0:1);
