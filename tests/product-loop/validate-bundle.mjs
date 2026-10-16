// F212: re-import an exported datapass.bundle v1 with the TypeScript validator (the one the artifact viewer uses).
//   node --experimental-strip-types tests/product-loop/validate-bundle.mjs FILE
// Prints {bundleSha256, files:[{path, sha256}], runs} on success; exits 1 with the DP-BUN code otherwise.
import {readFile} from 'node:fs/promises';
import {validateBundle} from '../../src/framework/foundation/bundle.ts';

const file=process.argv[2];
if(!file||process.argv.length!==3){console.error('usage: node --experimental-strip-types tests/product-loop/validate-bundle.mjs FILE');process.exit(2);}
try{
  const bundle=await validateBundle(JSON.parse(await readFile(file,'utf8')));
  console.log(JSON.stringify({bundleSha256:bundle.bundleSha256,files:bundle.files.map(f=>({path:f.path,sha256:f.sha256})),runs:bundle.runs.length}));
}catch(error){console.error(`${error?.code??'error'}: ${error?.message??error}`);process.exit(1);}
