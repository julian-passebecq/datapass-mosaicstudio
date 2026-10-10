import {test,expect,type Page,type Route} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';

// FR-01: a real Python runtime run whose artifact is altered in transit is refused with a source-bound diagnostic
// (gate + JSON Pointer of the offending field), and the last valid result stays visible as a stale previous result.
const PORT=Number(process.env.DATAPASS_TEST_ARTIFACT_RUNTIME_PORT||8797);
const ORIGIN=`http://127.0.0.1:${PORT}`;
const TOKEN='contract-token-'+Math.random().toString(36).slice(2,14).padEnd(12,'x');
let service:ChildProcess|null=null,errors:string[]=[];

async function startService(workbenchOrigin:string){
  service=spawn(process.env.PYTHON||'python',['py/service/app.py','--port',String(PORT),'--workbench-origin',workbenchOrigin],{env:{...process.env,DATAPASS_RUNTIME_TOKEN:TOKEN},stdio:['ignore','ignore','pipe']});
  let log='';service.stderr!.on('data',d=>{log+=String(d);});
  for(let i=0;i<120;i++){try{if((await fetch(ORIGIN+'/health')).ok)return;}catch{/* starting */}await new Promise(r=>setTimeout(r,250));}
  throw new Error('The runtime did not start: '+log.slice(-800));
}
async function stopService(){
  if(service&&service.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(service.pid),'/T','/F']);else service.kill();}
  service=null;
  for(let i=0;i<40;i++){try{await fetch(ORIGIN+'/health');}catch{return;}await new Promise(r=>setTimeout(r,250));}
  throw new Error('The runtime is still answering after it was stopped.');
}

type Corrupt=(artifact:Record<string,any>)=>void;
/** Rewrites each finished run's artifact with `corrupt` and re-records its sha256, so only the contract validator can refuse it. */
async function tamper(page:Page,corrupt:Corrupt){
  const altered=new Map<string,{body:string;headers:Record<string,string>}>();
  await page.route(`${ORIGIN}/api/runtime/v1/runs**`,async(route:Route)=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='OPTIONS')return route.continue();
    const artifactPath=url.pathname.match(/\/runs\/([^/]+)\/artifact$/);
    if(artifactPath){const stored=altered.get(artifactPath[1]);return stored?route.fulfill({status:200,headers:stored.headers,body:stored.body}):route.continue();}
    const response=await route.fetch(),record=await response.json(),headers={...response.headers()};delete headers['content-length'];
    if(record?.status==='succeeded'&&record.artifactSha256&&!altered.has(record.runId)){
      const {'content-type':_,...auth}=request.headers();
      const original=await route.fetch({url:`${ORIGIN}/api/runtime/v1/runs/${record.runId}/artifact`,method:'GET',headers:auth});
      const artifact=await original.json();corrupt(artifact);
      const body=JSON.stringify(artifact),artifactHeaders={...original.headers()};delete artifactHeaders['content-length'];
      altered.set(record.runId,{body,headers:artifactHeaders});
      record.artifactSha256=createHash('sha256').update(body,'utf8').digest('hex');
    }
    return route.fulfill({status:response.status(),headers,body:JSON.stringify(record)});
  });
}

test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>{expect(errors,'Unhandled browser exceptions').toEqual([]);});
test.afterAll(async()=>{await stopService();});

test('FR-01 runtime artifact refused at the structure and semantic gates with the offending field; last valid result stays',async({page,baseURL},info)=>{
  await startService(new URL(baseURL!).origin);
  await page.goto(`/?workspace=blank#runtime=${encodeURIComponent(ORIGIN)}&token=${TOKEN}`,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
  await page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'}).click();
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
  await page.getByRole('button',{name:'Add Python cell'}).click();
  const py=page.getByTestId('cell').first();
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','done',{timeout:30000});
  await expect(py.getByTestId('artifact')).toHaveAttribute('data-artifact-id','wind-reference-run');

  // Structure gate: the hash syntax is exact (64 lowercase hex characters).
  await tamper(page,a=>{a.provenance.inputHash='SHA256:'+'A'.repeat(64);});
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','error',{timeout:30000});
  await expect(py.locator('.cell-result .notice.error')).toContainText('failed datapass.artifact v1 validation: /provenance/inputHash: artifact inputHash must be 64 lowercase hex characters');
  await expect(py.locator('.previous-result')).toContainText('Previous result');
  await expect(py.locator('.previous-result').getByTestId('artifact')).toHaveAttribute('data-artifact-id','wind-reference-run');
  await page.screenshot({path:info.outputPath('artifact-structure-refusal.png'),fullPage:true});

  // Semantic gate: an artifact that depends on itself is structurally valid but refused, with the exact list entry.
  await page.unrouteAll({behavior:'wait'});
  await tamper(page,a=>{a.provenance.dependsOn=[a.id];});
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','error',{timeout:30000});
  await expect(py.locator('.cell-result .notice.error')).toContainText('failed datapass.artifact v1 validation: /provenance/dependsOn/0: artifact dependsOn: an artifact cannot depend on itself');
  await expect(py.locator('.previous-result').getByTestId('artifact')).toHaveAttribute('data-artifact-id','wind-reference-run');

  // Untampered again: the real runtime result is accepted.
  await page.unrouteAll({behavior:'wait'});
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','done',{timeout:30000});
  await expect(py.locator('.cell-result .notice.error')).toHaveCount(0);
});
