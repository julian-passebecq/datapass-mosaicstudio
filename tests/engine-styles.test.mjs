import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';

test('trusted custom package CSS is validated as a resource, not executed by Node',async()=>{
  const {writeFile}=await import('node:fs/promises');
  const {loadClient}=await import('../scripts/load-client.mjs');
  const id='engine-css-check-'+process.pid,folder=await scaffoldClient({id,custom:true});
  try{
    const file=path.join(folder,'ClientNote.tsx'),source=await readFile(file,'utf8');
    await writeFile(file,"import '@xyflow/react/dist/style.css';\n"+source);
    assert.equal((await loadClient(id)).manifest.id,id);
    await writeFile(file,"import './missing-engine-style.css';\n"+source);
    await assert.rejects(()=>loadClient(id),/missing-engine-style/);
  }finally{await rm(folder,{recursive:true,force:true});}
});
