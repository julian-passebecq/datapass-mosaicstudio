/** Build foil-wind from a LOCAL foil.export v1 bundle without the data ever touching the repository.
 *
 *   FOIL_EXPORT_DIR=<folder with export bundles> node --experimental-strip-types clients/foil-wind/build-export.mjs
 *   node --experimental-strip-types clients/foil-wind/build-export.mjs <folder>
 *
 * 1. `npm run build:client -- foil-wind` builds the page with the committed hand-made placeholder artifacts.
 * 2. Python (py/build_data.py --export) writes the export-derived artifacts straight into dist-clients/foil-wind/artifacts
 *    (dist-clients/ is git-ignored); the committed placeholder files are not modified.
 * 3. Every written artifact is re-validated and preview.json is regenerated so its file hashes match.
 * Any failure removes the half-built folder and exits non-zero with the reason.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {validateArtifact} from '../../src/framework/foundation/artifact.ts';
import {writePreview} from '../../scripts/preview-validate.mjs';

const repo=path.resolve(import.meta.dirname,'..','..');
const source=process.argv[2]||process.env.FOIL_EXPORT_DIR;
if(!source||process.argv.length>3){console.error('Usage: FOIL_EXPORT_DIR=<export folder> node --experimental-strip-types clients/foil-wind/build-export.mjs [<export folder>]');process.exit(2);}
const exportDir=path.resolve(source);
const rel=path.relative(repo,exportDir);
if(!rel.startsWith('..')&&!path.isAbsolute(rel)){console.error('foil-wind: the export folder must be outside the repository so it can never be committed.');process.exit(2);}
const out=path.join(repo,'dist-clients','foil-wind');
const python=['python','python3','py'].find(cmd=>spawnSync(cmd,['--version'],{encoding:'utf8'}).status===0);
if(!python){console.error('foil-wind: Python 3 is required for the data step.');process.exit(2);}
const fail=async message=>{console.error('foil-wind: '+message);await rm(out,{recursive:true,force:true});process.exit(1);};

const build=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs','foil-wind'],{cwd:repo,stdio:'inherit',env:{...process.env,FOIL_EXPORT_DIR:''}});
if(build.status!==0)process.exit(build.status||1);
const artifacts=path.join(out,'artifacts');
const data=spawnSync(python,[path.join('clients','foil-wind','py','build_data.py'),'--export',exportDir,'--out',artifacts],{cwd:repo,stdio:'inherit'});
if(data.status!==0)await fail('the local export was rejected; the build folder was removed.');

const listed=[];
for(const name of (await readdir(artifacts)).filter(n=>n.endsWith('.json')).sort()){
  try{const a=validateArtifact(JSON.parse(await readFile(path.join(artifacts,name),'utf8')));listed.push({id:a.id,path:'artifacts/'+name,provenance:a.provenance.kind});}
  catch(e){await fail(`artifacts/${name} failed validation: ${e.message}`);}
}
const previewFile=path.join(out,'preview.json');
if(!existsSync(previewFile))await fail('preview.json missing after build:client');
const previous=JSON.parse(await readFile(previewFile,'utf8'));
const doc=await writePreview(out,{app:previous.app,entry:previous.entry,sdkVersion:previous.sdkVersion,sourceCommit:previous.sourceCommit,publication:previous.publication,
  capabilities:previous.capabilities,artifacts:listed,open:previous.open,csp:previous.csp});
console.log(`foil-wind: built from a local export into dist-clients/foil-wind (${listed.length} artifacts, ${doc.files.length} files). Not committed, not deployed.`);
