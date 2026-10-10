// FR-02/FR-03 unit checks: Jupyter adapter (fake server + fake websocket), untrusted output rendering,
// notebook cell kinds, stored-result validation and the notebook service client. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cellSourceKey,executionPlan,staleReason,validateNotebook} from '../src/workspace/notebook.ts';
import {JupyterClient,JupyterError,OutputCollector,jupyterOrigin,publishTableCode,validateTable,validJupyterToken,TABLE_MIME} from '../src/workspace/jupyter.ts';
import {renderOutputs} from '../src/workspace/outputs.ts';
import {NotebookService,validateImport,validateResultDoc,storedTable,resultTable} from '../src/workspace/results.ts';
import {validateWorkspace,blankWorkspace} from '../src/workspace/persist.ts';

const MODULES=['notebook','explore','linked','sql','pipeline','stories','explain','board','architecture'];
const TOKEN='synthetic-jupyter-token-0123456789';
const jup=(id,deps=[],code='x = 1',outputTable)=>({id,kind:'jupyter',title:id,code,dependsOn:deps,...(outputTable?{outputTable}:{})});
const sql=(id,deps=[])=>({id,kind:'sql',title:id,sql:'SELECT 1',dependsOn:deps});
const inert=(id)=>({id,kind:'inert',title:id,source:'raw',original:JSON.stringify({cell_type:'raw',metadata:{},source:'raw'}),reason:'raw cell',dependsOn:[]});

test('notebook: jupyter cells run in the dependency plan, inert cells never run and cannot be depended on',()=>{
  const nb=validateNotebook({cells:[jup('make',[],'rows=[]','rows'),inert('raw'),sql('report',['make'])]});
  assert.deepEqual(executionPlan(nb,'report'),['make','report']);
  assert.deepEqual(executionPlan(nb,'raw'),[]);
  assert.throws(()=>validateNotebook({cells:[inert('raw'),sql('q',['raw'])]}),/inert/);
  assert.throws(()=>validateNotebook({cells:[{...inert('raw'),original:'not json'}]}),/original/);
  assert.throws(()=>validateNotebook({cells:[{...jup('a'),outputTable:'Bad Name'}]}),/output table/);
  assert.throws(()=>validateNotebook({cells:[jup('a',[],'x','t'),{...jup('b',[],'y','t')}]}),/duplicate output table/);
  // Staleness: editing the source after a run makes the result stale; a newer dependency result does too.
  const runs={make:{cellId:'make',sequence:1,sourceKey:cellSourceKey(nb.cells[0]),dependencySequences:{}},report:{cellId:'report',sequence:2,sourceKey:cellSourceKey(nb.cells[2]),dependencySequences:{make:1}}};
  assert.equal(staleReason(nb,runs,'report'),null);
  const edited=validateNotebook({cells:[{...nb.cells[0],code:'rows=[1]'},nb.cells[1],nb.cells[2]]});
  assert.match(staleReason(edited,runs,'make'),/changed/);
  assert.match(staleReason(edited,runs,'report'),/stale/);
  // Python source is user input saved in the workspace; tokens are not part of any cell.
  const doc=validateWorkspace({...blankWorkspace(),notebook:nb},MODULES);
  assert.equal(doc.notebook.cells[0].code,'rows=[]');
});

test('jupyter pairing: loopback origin and token shape are checked before any request',()=>{
  assert.equal(jupyterOrigin('http://127.0.0.1:28888/'),'http://127.0.0.1:28888');
  for(const bad of ['https://127.0.0.1:28888','http://192.168.1.10:8888','http://evil.example:8888','http://127.0.0.1','http://127.0.0.1:28888/lab','http://127.0.0.1:28888/?token=abc','http://u:p@127.0.0.1:1'])
    assert.throws(()=>jupyterOrigin(bad),JupyterError,bad);
  assert.ok(validJupyterToken(TOKEN));
  assert.ok(!validJupyterToken('short'));assert.ok(!validJupyterToken('has space in it 0123456789'));
  let calls=0;
  assert.throws(()=>new JupyterClient({origin:'http://10.0.0.5:8888',token:TOKEN},{fetch:async()=>{calls++;}}),/loopback/);
  assert.equal(calls,0);
});

/** A fake Jupyter Server (REST) + kernel websocket that answers execute_request like ipykernel would. */
function fakeServer({badToken=false,interruptible=true}={}){
  const requests=[],sockets=[];
  const fetch=async(url,init)=>{
    requests.push({url,method:init.method,auth:init.headers.Authorization,credentials:init.credentials});
    const path=new URL(url).pathname;
    const reply=(status,body)=>({ok:status<300,status,text:async()=>body===undefined?'':JSON.stringify(body)});
    if(badToken)return reply(403,{message:'Forbidden'});
    if(path==='/api/status')return reply(200,{started:'x',kernels:0});
    if(path==='/api')return reply(200,{version:'2.21.1'});
    if(path==='/api/kernelspecs')return reply(200,{default:'python3',kernelspecs:{python3:{name:'python3',spec:{language:'python'}},ir:{name:'ir',spec:{language:'R'}}}});
    if(path==='/api/kernels'&&init.method==='POST')return reply(201,{id:'0b5c2d3e-0000-4000-8000-000000000001',name:'python3'});
    if(path.endsWith('/interrupt')){for(const s of sockets)s.interrupt();return reply(204);}
    if(init.method==='DELETE')return reply(204);
    return reply(404,{message:'nope'});
  };
  const socket=url=>{
    const ws={url,readyState:0,sent:[],onopen:null,onclose:null,onerror:null,onmessage:null,running:null,
      send(data){const m=JSON.parse(data);this.sent.push(m);handle(this,m);},
      close(){this.readyState=3;this.onclose?.({code:1000,reason:''});},
      interrupt(){if(this.running&&interruptible){const m=this.running;this.running=null;emit(this,m,'iopub','error',{ename:'KeyboardInterrupt',evalue:'',traceback:['\u001b[31mKeyboardInterrupt\u001b[0m']});emit(this,m,'shell','execute_reply',{status:'error',ename:'KeyboardInterrupt',evalue:'',execution_count:3});emit(this,m,'iopub','status',{execution_state:'idle'});}},
      drop(){this.readyState=3;this.onclose?.({code:1006,reason:'server stopped'});}};
    sockets.push(ws);setTimeout(()=>{ws.readyState=1;ws.onopen?.({});},0);return ws;
  };
  function emit(ws,parent,channel,type,content){ws.onmessage?.({data:JSON.stringify({channel,header:{msg_type:type,msg_id:Math.random().toString(16)},parent_header:{msg_id:parent.header.msg_id},metadata:{},content})});}
  function handle(ws,m){
    const code=m.content.code;
    setTimeout(()=>{
      emit(ws,m,'iopub','status',{execution_state:'busy'});
      if(code.includes('__datapass_publish_table')){emit(ws,m,'iopub','display_data',{data:{[TABLE_MIME]:{columns:['step','value'],rows:[[0,1.5],[1,2.5]],total:2,truncated:false}},metadata:{}});emit(ws,m,'shell','execute_reply',{status:'ok',execution_count:null});emit(ws,m,'iopub','status',{execution_state:'idle'});return;}
      if(code.includes('long')){ws.running=m;emit(ws,m,'iopub','stream',{name:'stdout',text:'started\n'});return;}
      if(code.includes('boom')){emit(ws,m,'iopub','error',{ename:'ValueError',evalue:'synthetic',traceback:['tb']});emit(ws,m,'shell','execute_reply',{status:'error',ename:'ValueError',evalue:'synthetic',execution_count:2});emit(ws,m,'iopub','status',{execution_state:'idle'});return;}
      emit(ws,m,'iopub','stream',{name:'stdout',text:'hello '});emit(ws,m,'iopub','stream',{name:'stdout',text:'world\n'});
      emit(ws,m,'iopub','execute_result',{data:{'text/plain':'42'},metadata:{},execution_count:1});
      emit(ws,m,'shell','execute_reply',{status:'ok',execution_count:1});emit(ws,m,'iopub','status',{execution_state:'idle'});
    },1);
  }
  return {fetch,socket,requests,sockets};
}

test('jupyter adapter: pair, execute, publish a bounded table, interrupt, failure and disconnect are distinct',async()=>{
  const server=fakeServer();
  const client=new JupyterClient({origin:'http://127.0.0.1:28888',token:TOKEN},server);
  const info=await client.connect();
  assert.equal(info.kernelName,'python3');assert.equal(info.serverVersion,'2.21.1');
  assert.ok(server.requests.every(r=>r.auth==='token '+TOKEN&&r.credentials==='omit'&&!r.url.includes(TOKEN)),'REST calls carry the token in the header only');
  assert.match(server.sockets[0].url,/^ws:\/\/127\.0\.0\.1:28888\/api\/kernels\/[0-9a-f-]+\/channels\?session_id=/);
  const ok=await client.execute('print("hello world")').done;
  assert.equal(ok.status,'ok');assert.equal(ok.executionCount,1);
  assert.deepEqual(ok.outputs.map(o=>o.output_type),['stream','execute_result']);
  assert.equal(ok.outputs[0].text,'hello world\n');
  const table=await client.publishTable('synthetic');
  assert.deepEqual(table.columns,[{name:'step',type:'number'},{name:'value',type:'number'}]);
  assert.match(server.sockets[0].sent.at(-1).content.code,/__datapass_publish_table\("synthetic", 10000, 64\)/);
  assert.equal(server.sockets[0].sent.at(-1).content.store_history,false);
  const failed=await client.execute('boom').done;
  assert.equal(failed.status,'error');assert.equal(failed.error.ename,'ValueError');
  const long=client.execute('long');
  await new Promise(r=>setTimeout(r,10));
  await client.interrupt(long.id);
  const interrupted=await long.done;
  assert.equal(interrupted.status,'interrupted');
  assert.ok(server.requests.some(r=>r.url.endsWith('/interrupt')&&r.method==='POST'));
  const pending=client.execute('long');
  await new Promise(r=>setTimeout(r,10));
  let lost='';client.onDisconnect=reason=>{lost=reason;};
  server.sockets[0].drop();
  const dropped=await pending.done;
  assert.equal(dropped.status,'disconnected');assert.match(dropped.detail,/not observed/);
  assert.match(lost,/server stopped/);
  assert.throws(()=>client.execute('x = 1'),/No kernel is connected/);
});

test('jupyter adapter: a refused token is reported as denied and starts no kernel',async()=>{
  const server=fakeServer({badToken:true});
  const client=new JupyterClient({origin:'http://127.0.0.1:28888',token:TOKEN},server);
  await assert.rejects(client.connect(),e=>e instanceof JupyterError&&e.kind==='denied'&&/refused the token/.test(e.message));
  assert.ok(!server.requests.some(r=>r.method==='POST'));
});

test('outputs: bounded collection; HTML/SVG shown as text, scripts refused, other MIME preserved not displayed',()=>{
  const c=new OutputCollector(200);
  c.add('stream',{name:'stdout',text:'a'});c.add('stream',{name:'stdout',text:'b'});
  assert.equal(c.outputs.length,1);assert.equal(c.outputs[0].text,'ab');
  c.add('stream',{name:'stderr',text:'x'.repeat(500)});
  assert.ok(c.truncated);assert.match(c.outputs.at(-1).text,/truncated/);
  const items=renderOutputs([
    {output_type:'display_data',data:{'text/html':'<img src=x onerror=alert(1)><script>alert(2)</script>'},metadata:{}},
    {output_type:'display_data',data:{'application/javascript':'alert(3)','text/plain':'fallback'},metadata:{}},
    {output_type:'display_data',data:{'image/png':'iVBORw0KGgo=','image/svg+xml':'<svg onload=alert(4)/>'},metadata:{}},
    {output_type:'display_data',data:{'application/vnd.custom+json':{a:1}},metadata:{}},
    {output_type:'error',ename:'E',evalue:'v',traceback:['\u001b[31mred\u001b[0m']},
  ]);
  assert.deepEqual(items.map(i=>i.kind),['markup-as-text','text','refused','image','unsupported','unsupported','error']);
  assert.equal(items[0].text.includes('<script>'),true,'markup is kept as inert text, not rendered');
  assert.equal(items[3].src,'data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(items[4].mimes,['image/svg+xml']);
  assert.equal(items[6].traceback,'red');
  assert.equal(renderOutputs([{output_type:'display_data',data:{'image/png':'not base64 <script>'},metadata:{}}])[0].kind,'unsupported');
});

test('published and stored tables are validated as a whole; mixed columns become text',()=>{
  const t=validateTable({columns:['a','b'],rows:[[1,'x'],[2,3]],total:5});
  assert.deepEqual(t.columns.map(c=>c.type),['number','string']);assert.equal(t.rows[1][1],'3');assert.ok(t.truncated);
  for(const bad of [{columns:['a','a'],rows:[]},{columns:['a'],rows:[[1,2]]},{columns:['a'],rows:[[{}]]},{columns:['a'],rows:[[Infinity]]},{columns:[],rows:[]}])
    assert.throws(()=>validateTable(bad),JupyterError);
  assert.throws(()=>publishTableCode('Bad-Name'),/lowercase/);
  const doc={format:'datapass.cell-result',version:1,cellId:'py-1',cellKind:'jupyter',sourceSha256:'a'.repeat(64),outputs:[{output_type:'stream',name:'stdout',text:'x'}],table:storedTable(t),executionCount:1,finishedAt:'2026-10-10T00:00:00Z',origin:'jupyter'};
  assert.deepEqual(resultTable(validateResultDoc(doc)).columns,t.columns);
  assert.throws(()=>validateResultDoc(doc,{cellId:'other'}),/another cell/);
  assert.throws(()=>validateResultDoc({...doc,format:'x'}),/cell-result/);
});

test('notebook service client: token in a header, hash-checked results, import validated as a whole',async()=>{
  const body={format:'datapass.cell-result',version:1,cellId:'py-1',cellKind:'jupyter',sourceSha256:'b'.repeat(64),outputs:[],table:null,executionCount:null,finishedAt:'2026-10-10T00:00:00Z',origin:'jupyter'};
  const text=JSON.stringify(body),sha=createHash('sha256').update(text).digest('hex');
  const seen=[];
  const fetch=async(url,init)=>{seen.push({url,headers:init.headers,credentials:init.credentials});
    const p=new URL(url).pathname;
    if(p.endsWith('/results/'+sha))return {ok:true,status:200,text:async()=>text};
    if(p.endsWith('/results/'+'c'.repeat(64)))return {ok:true,status:200,text:async()=>text};
    if(p.endsWith('/ipynb/import'))return {ok:true,status:200,text:async()=>JSON.stringify({format:'datapass.ipynb-import',version:1,cells:[{id:'q',kind:'sql',title:'q',sql:'SELECT 1',dependsOn:['ghost']}],outputs:{},loss:[]})};
    return {ok:false,status:507,text:async()=>JSON.stringify({detail:'The result store is full'})};
  };
  const s=new NotebookService({origin:'http://127.0.0.1:28765',token:'runtime-token-0123456789'},{fetch});
  assert.equal((await s.result(sha,'py-1')).cellId,'py-1');
  await assert.rejects(s.result('c'.repeat(64)),/does not match its hash/);
  await assert.rejects(s.importIpynb('x.ipynb','{}'),/unknown cell/);
  await assert.rejects(s.save({cells:[],outputs:{},executionCounts:{},results:{}},[]),e=>e.status===507&&/full/.test(e.message));
  assert.ok(seen.every(r=>r.headers['X-Datapass-Token']==='runtime-token-0123456789'&&r.credentials==='omit'&&!r.url.includes('token')));
  assert.throws(()=>validateImport({format:'datapass.ipynb-import',version:1,cells:[{id:'p',kind:'jupyter',title:'p',code:'x',dependsOn:[],extra:1}]}),/unexpected fields/);
});

test('the excluded Mosaic VS Code repository is not a dependency or import of the workbench',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const deps=Object.keys({...pkg.dependencies,...pkg.devDependencies});
  assert.ok(!deps.some(d=>/mosaic-vscode/i.test(d)));
  for(const f of ['../src/panels/Notebook.tsx','../src/workspace/jupyter.ts','../src/workspace/results.ts','../py/service/requirements-jupyter.txt'])
    assert.ok(!/datapass-mosaic-vscode/.test(readFileSync(new URL(f,import.meta.url),'utf8')),f);
});
