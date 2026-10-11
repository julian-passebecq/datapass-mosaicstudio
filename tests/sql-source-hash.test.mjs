// M-SQLHASH: the result store records each SQL cell's authored-source hash (py/service/result_store.py
// sql_source_sha256). It must equal the browser's own definition, cellSourceKey() hashed by sourceSha256().
// The shared synthetic vectors are checked here and by py/service/test_notebook.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cellSourceKey} from '../src/workspace/notebook.ts';
import {sourceSha256} from '../src/workspace/results.ts';

const vectors=JSON.parse(readFileSync(new URL('./fixtures/sql-source-hash/vectors.json',import.meta.url),'utf8'));

test('SQL source hash vectors equal the browser cellSourceKey hash',async()=>{
  assert.equal(vectors.synthetic,true);
  assert.ok(vectors.cases.length>=8);
  for(const c of vectors.cases){
    const cell={id:'sql-1',kind:'sql',title:'SYNTHETIC',sql:c.sql,dependsOn:[]};
    assert.equal(await sourceSha256(cellSourceKey(cell)),c.sourceSha256,c.id);
  }
});

test('the hash covers the SQL text only: title and dependencies do not change it, one character does',async()=>{
  const base={id:'sql-1',kind:'sql',title:'A',sql:'SELECT 1',dependsOn:[]};
  const h=await sourceSha256(cellSourceKey(base));
  assert.equal(await sourceSha256(cellSourceKey({...base,title:'B',dependsOn:['py-1']})),h);
  assert.notEqual(await sourceSha256(cellSourceKey({...base,sql:'SELECT 1 '})),h);
});
