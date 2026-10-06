import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';
test('invalid scaffold options do not leave a partially created client',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'studio-options-'));try{await assert.rejects(scaffoldClient({id:'invalid',root,custom:'yes'}),/boolean/);await assert.rejects(readFile(path.join(root,'clients/invalid/app.ts'),'utf8'),/ENOENT/);}finally{await rm(root,{recursive:true,force:true});}});
