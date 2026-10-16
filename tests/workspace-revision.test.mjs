// F205 cross-tab workspace conflicts: the revision sidecar and the guard. Two tabs share one key-value port. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {WorkspaceRevisionGuard,WORKSPACE_REVISION_KEY,parseRevision,sha256HexSync,newTabId} from '../src/workspace/revision.ts';
import {blankWorkspace,saveWorkspace,loadWorkspace,validateWorkspace,WORKSPACE_KEY} from '../src/workspace/persist.ts';
import {memoryKeyValue} from '../src/framework/storage/index.ts';
import {diagnostic} from '../src/framework/diagnostics/index.ts';

const MODULES=['notebook','explore','linked','sql','pipeline','stories','explain','board','architecture'];
const A='tab-00000000000000aa',B='tab-00000000000000bb';
const doc=(query,module='notebook')=>({...blankWorkspace(module),savedAt:'2026-10-16T02:00:00.000Z',queries:[{id:'q1',name:'Synthetic',query}],selectedQueryId:'q1'});
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');

test('sha256HexSync matches node:crypto on ASCII, multi-byte and block-boundary inputs',()=>{
  for(const text of ['','abc','é€😀 synthetic',...[55,56,63,64,65,119,120,1000].map(n=>'x'.repeat(n))])assert.equal(sha256HexSync(text),sha(text),JSON.stringify(text.slice(0,12))+text.length);
});

test('the sidecar is strict; anything else reads as no sidecar',()=>{
  assert.deepEqual(parseRevision(JSON.stringify({rev:3,tab:A,sha256:'a'.repeat(64)})),{rev:3,tab:A,sha256:'a'.repeat(64)});
  assert.deepEqual(parseRevision(JSON.stringify({rev:0,tab:A,sha256:null})),{rev:0,tab:A,sha256:null});
  for(const bad of [null,'not json','[]',JSON.stringify({rev:-1,tab:A,sha256:null}),JSON.stringify({rev:1.5,tab:A,sha256:null}),JSON.stringify({rev:1,tab:'tab-x',sha256:null}),
    JSON.stringify({rev:1,tab:A,sha256:'ABC'}),JSON.stringify({rev:1,tab:A,sha256:null,extra:1}),'{"__proto__":{"rev":1}}'])assert.equal(parseRevision(bad),null,String(bad));
  assert.match(newTabId(),/^tab-[0-9a-f]{16}$/);
  assert.throws(()=>new WorkspaceRevisionGuard(memoryKeyValue(),MODULES,{tab:'bad'}),/tab id/);
});

test('a save writes the unchanged v1 document plus a sidecar; the document never carries a revision',()=>{
  const store=memoryKeyValue(),direct=memoryKeyValue();
  const guard=new WorkspaceRevisionGuard(store,MODULES,{tab:A});
  assert.equal(guard.revision,0);
  assert.deepEqual(guard.save(doc('SELECT 1')),{status:'saved'});
  saveWorkspace(direct,doc('SELECT 1'),MODULES);
  const raw=store.getItem(WORKSPACE_KEY),stored=JSON.parse(raw);
  assert.deepEqual({...stored,savedAt:''},{...JSON.parse(direct.getItem(WORKSPACE_KEY)),savedAt:''},'same document as the pre-F205 save path');
  assert.equal(stored.version,1);assert.equal('revision' in stored,false);
  assert.deepEqual(validateWorkspace(stored,MODULES).queries[0].query,'SELECT 1','still accepted by the strict v1 validator');
  assert.deepEqual(JSON.parse(store.getItem(WORKSPACE_REVISION_KEY)),{rev:1,tab:A,sha256:sha(raw)});
  assert.deepEqual(store.keys().sort(),[WORKSPACE_KEY,WORKSPACE_REVISION_KEY].sort());
  assert.deepEqual(guard.save(doc('SELECT 2')),{status:'saved'});
  assert.equal(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)).rev,2);
  assert.equal(loadWorkspace(store,MODULES).doc.queries[0].query,'SELECT 2');
});

test('two tabs: the second writer is refused and nothing is written while the conflict is open',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A}),b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  assert.equal(a.save(doc('SELECT 1 -- tab A')).status,'saved');
  const theirs=store.getItem(WORKSPACE_KEY),sidecar=store.getItem(WORKSPACE_REVISION_KEY);
  const outcome=b.save(doc('SELECT 2 -- tab B'));
  assert.equal(outcome.status,'conflict');
  assert.equal(outcome.conflict.code,'DP-STO-001');assert.equal(diagnostic('DP-STO-001').rule,'workspace-conflict');
  assert.equal(outcome.conflict.theirsRaw,theirs);assert.deepEqual(outcome.conflict.theirs,{rev:1,tab:A,sha256:sha(theirs)});assert.equal(outcome.conflict.sidecarMatches,true);
  assert.equal(store.getItem(WORKSPACE_KEY),theirs,'no silent last-writer-wins');assert.equal(store.getItem(WORKSPACE_REVISION_KEY),sidecar);
  assert.equal(b.save(doc('SELECT 3 -- tab B')).status,'conflict','still refused');
  assert.equal(b.reset().status,'conflict','reset is refused too');
  assert.equal(store.getItem(WORKSPACE_KEY),theirs);
});

test('keep mine overwrites explicitly and continues the revision sequence',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A}),b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  a.save(doc('SELECT 1'));a.save(doc('SELECT 11'));
  assert.equal(b.save(doc('SELECT 2')).status,'conflict');
  assert.deepEqual(b.keepMine(doc('SELECT 2')),{status:'saved'});
  assert.equal(b.conflict,null);
  assert.equal(loadWorkspace(store,MODULES).doc.queries[0].query,'SELECT 2');
  assert.deepEqual(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)),{rev:3,tab:B,sha256:sha(store.getItem(WORKSPACE_KEY))});
  assert.equal(b.save(doc('SELECT 22')).status,'saved','B saves normally afterwards');
  assert.equal(a.save(doc('SELECT 111')).status,'conflict','and now A is the one who sees the conflict');
});

test('take theirs validates the whole document; an invalid one changes nothing',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A}),b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  a.save(doc('SELECT 1 -- theirs','explore'));
  assert.equal(b.detect().code,'DP-STO-001');
  const {doc:taken}=b.takeTheirs();
  assert.equal(taken.queries[0].query,'SELECT 1 -- theirs');assert.equal(taken.module,'explore');
  assert.equal(b.conflict,null);assert.equal(b.revision,1);
  assert.equal(b.save(doc('SELECT 2')).status,'saved');assert.equal(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)).rev,2);
  // An invalid foreign document (a shell cell): refused, the conflict stays open, storage untouched.
  const bad=JSON.stringify({...doc('x'),notebook:{cells:[{id:'x',kind:'shell'}]}});
  store.setItem(WORKSPACE_KEY,bad);
  assert.equal(b.detect().sidecarMatches,false,'a writer without a sidecar is unknown (DP-STO-002)');
  assert.equal(b.detect().theirs,null);
  assert.throws(()=>b.takeTheirs(),/was not loaded: .*Nothing changed/);
  assert.notEqual(b.conflict,null);assert.equal(store.getItem(WORKSPACE_KEY),bad);
  store.setItem(WORKSPACE_KEY,'{not json');
  assert.throws(()=>b.takeTheirs(),/not valid JSON/);
  assert.ok(diagnostic('DP-STO-002')&&diagnostic('DP-STO-003'));
});

test('take theirs follows the latest bytes the other tab saved',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A}),b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  a.save(doc('SELECT 1'));
  const opened=b.detect().detectedAt;
  a.save(doc('SELECT 1 -- newer'));
  assert.equal(b.detect().detectedAt,opened,'the same conflict, refreshed');
  assert.equal(b.takeTheirs().doc.queries[0].query,'SELECT 1 -- newer');
  assert.equal(b.save(doc('SELECT 2')).status,'saved');
  assert.equal(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)).rev,3,'B continues after the revision it took');
});

test('a reset by the other tab is a conflict; taking it yields no document',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A});a.save(doc('SELECT 1'));
  const b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  assert.equal(a.reset().status,'saved');
  assert.equal(store.getItem(WORKSPACE_KEY),null);
  assert.deepEqual(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)),{rev:2,tab:A,sha256:null});
  const c=b.detect();assert.equal(c.theirsRaw,null);assert.equal(c.sidecarMatches,true);
  assert.deepEqual(b.takeTheirs(),{doc:null});
  assert.equal(b.save(doc('SELECT 3')).status,'saved');
  assert.equal(parseRevision(store.getItem(WORKSPACE_REVISION_KEY)).rev,3);
});

test('identical bytes from another tab are not a conflict; a missing port never writes',()=>{
  const store=memoryKeyValue();
  const a=new WorkspaceRevisionGuard(store,MODULES,{tab:A}),b=new WorkspaceRevisionGuard(store,MODULES,{tab:B});
  assert.equal(b.detect(),null,'nothing saved yet on either side');
  assert.equal(a.save(doc('SELECT 1')).status,'saved');
  const raw=store.getItem(WORKSPACE_KEY),rev=store.getItem(WORKSPACE_REVISION_KEY);
  assert.equal(a.save({...doc('SELECT 1'),savedAt:'2030-01-01T00:00:00.000Z'}).status,'unchanged','same content: no write, no revision bump');
  assert.equal(store.getItem(WORKSPACE_KEY),raw);assert.equal(store.getItem(WORKSPACE_REVISION_KEY),rev);
  const c=new WorkspaceRevisionGuard(store,MODULES,{tab:'tab-00000000000000cc'});
  assert.equal(c.save(doc('SELECT 1')).status,'unchanged','a newly opened tab does not rewrite what it loaded');
  assert.equal(b.detect().code,'DP-STO-001',"but B, which loaded nothing, sees A's write");
  const none=new WorkspaceRevisionGuard(null,MODULES,{tab:A});
  assert.equal(none.detect(),null);assert.equal(none.save(doc('x')).status,'error');
  void a;
});

test('store.ts routes every autosave and reset through the guard and listens for storage events',()=>{
  const source=readFileSync('src/store.ts','utf8');
  assert.ok(!/saveWorkspace\(/.test(source),'no direct saveWorkspace call bypasses the guard');
  assert.match(source,/guard\.save\(doc\)/);assert.match(source,/guard\.reset\(\)/);
  assert.match(source,/addEventListener\('storage'/);
  assert.ok(!source.includes('run-history'));
});
