#!/usr/bin/env node
/**
 * `datapass` command (F211): a thin dispatcher over the existing npm scripts, with no logic of its own.
 *
 *   datapass <command> [args...]        (installed bin)
 *   node scripts/datapass.mjs <command> [args...]
 *   node sdk/scripts/datapass.mjs <command> [args...]   (from an unpacked SDK release)
 *
 * Each command runs the same script with the same Node flags as its npm script (tests/cli-dispatch.test.mjs keeps
 * them equal), from the package root, with the remaining arguments passed through and the exit code propagated.
 * Artifact validation stays in Python: `python -m datapass_artifact validate <file>` (run from py/).
 */
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_ROOT=path.resolve(import.meta.dirname,'..');
const STRIP=['--experimental-strip-types'];
/** command → npm script it mirrors, Node flags and script file (relative to the package root). */
export const COMMANDS=Object.freeze({
  new:{npm:'client:new',flags:STRIP,script:'scripts/scaffold-client.mjs',summary:'scaffold a new client folder (never overwrites)'},
  check:{npm:'client:check',flags:STRIP,script:'scripts/check-clients.mjs',summary:'check client descriptors and sources'},
  context:{npm:'client:context',flags:STRIP,script:'scripts/client-context.mjs',summary:'print the capability-specific authoring route of a client'},
  dev:{npm:'client:dev',flags:STRIP,script:'scripts/client-dev.mjs',summary:'run the selected-client dev server'},
  build:{npm:'build:client',flags:STRIP,script:'scripts/build-client.mjs',summary:'build one selected client into dist-clients/<id>'},
  'preview-validate':{npm:'preview:validate',flags:[],script:'scripts/preview-validate.mjs',summary:'validate a preview.json'},
  'concept-validate':{npm:'concept:validate',flags:[],script:'scripts/concept-validate.mjs',summary:'validate a concept spec'},
  pack:{npm:'sdk:pack',flags:[],script:'scripts/sdk-pack.mjs',summary:'pack the SDK release folder (local only, nothing published)'},
  verify:{npm:'sdk:verify',flags:[],script:'scripts/sdk-verify.mjs',summary:'verify an SDK release folder'},
  doctor:{npm:'doctor',flags:STRIP,script:'scripts/doctor.mjs',summary:'check the author/consumer environment'},
});

/** The npm script text a command is equivalent to (`node <flags> <script>`). */
export const npmEquivalent=name=>['node',...COMMANDS[name].flags,COMMANDS[name].script].join(' ');

export function usage(){
  const width=Math.max(...Object.keys(COMMANDS).map(k=>k.length));
  return ['Usage: datapass <command> [args...]','',
    ...Object.entries(COMMANDS).map(([k,c])=>`  ${k.padEnd(width)}  ${c.summary} (npm run ${c.npm})`),'',
    'Artifact validation: python -m datapass_artifact validate <file> (from py/).'].join('\n');
}

/** Spawn arguments for a command; null for an unknown command. */
export function plan(name,args=[]){
  const c=Object.hasOwn(COMMANDS,name)?COMMANDS[name]:null;
  if(!c)return null;
  return {command:process.execPath,args:[...c.flags,path.join(PACKAGE_ROOT,c.script),...args],cwd:PACKAGE_ROOT};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [name,...rest]=process.argv.slice(2);
  if(!name||name==='help'||name==='--help'||name==='-h'){console.log(usage());process.exit(name?0:2);}
  const p=plan(name,rest);
  if(!p){console.error(`Unknown command: ${name}\n\n${usage()}`);process.exit(2);}
  const child=spawn(p.command,p.args,{cwd:p.cwd,stdio:'inherit'});
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{child.kill(sig);});
  child.on('error',e=>{console.error(e.message);process.exit(1);});
  child.on('exit',(code,signal)=>process.exit(code??(signal?1:0)));
}
