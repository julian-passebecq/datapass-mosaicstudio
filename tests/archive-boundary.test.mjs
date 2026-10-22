import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {archiveFiles,safeRelativePath,sha256,verifySdkRelease} from '../scripts/sdk-verify.mjs';
import {extractCompanion,verifyRuntimeCompanion} from '../scripts/runtime-verify.mjs';

// Inert synthetic ustar records; all filesystem probes stay inside this test's own temp folder.
function archive(entries){
  const blocks=[];
  for(const {name,type='0',text='synthetic'} of entries){
    const data=type==='5'?Buffer.alloc(0):Buffer.from(text),header=Buffer.alloc(512);
    header.write(name,0,100);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write(data.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);
    header.write('        ',148);header.write(type,156);header.write('ustar\0',257);header.write('00',263);
    const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
    blocks.push(header,data,Buffer.alloc((512-data.length%512)%512));
  }
  return gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]));
}
async function temporary(run){const dir=await mkdtemp(path.join(tmpdir(),'mosaic-archive-boundary-'));try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
function pax(key,value){const body=` ${key}=${value}\n`;let length=Buffer.byteLength(body)+1;while(String(length).length+Buffer.byteLength(body)!==length)length=String(length).length+Buffer.byteLength(body);return length+body;}

test('PAX path overrides are checked and unsupported extraction metadata is refused',()=>{
  for(const [type,key,value] of [['g','path','root/../../outside'],['g','size','0'],['x','size','0'],['x','linkpath','../outside']])
    assert.throws(()=>archiveFiles(archive([{name:'pax',type,text:pax(key,value)},{name:'root/good.txt'}])),/Unsupported pax metadata/);
  assert.throws(()=>archiveFiles(archive([{name:'pax',type:'x',text:pax('path','../outside')},{name:'root/good.txt'}])),/Unsafe archive path/);
  assert.throws(()=>archiveFiles(archive([{name:'pax',type:'x',text:pax('path','root/../../outside')},{name:'pax',type:'x',text:pax('path','root/safe')},{name:'root/file'}])),/Redundant metadata/);
  assert.throws(()=>archiveFiles(archive([{name:'root/file'},{name:'pax',type:'x',text:pax('path','root/orphan')}])),/Orphan per-entry/);
  const valid=archiveFiles(archive([{name:'pax',type:'g',text:pax('comment','a'.repeat(40))},{name:'pax',type:'x',text:pax('path','root/nested/file.txt')},{name:'placeholder'}]));
  assert.deepEqual(valid.files.map(f=>f.path),['nested/file.txt']);
});

test('archive paths validate the root and directories before stripping the root',()=>{
  for(const root of ['..','.','C:','C:\\escape','/absolute','NUL','root.','root ']){
    assert.throws(()=>archiveFiles(archive([{name:root+'/file.txt'}])),/Unsafe archive path/,root);
  }
  for(const name of ['root/../','root/./','root//','root/C:/','root/CON/']){
    assert.throws(()=>archiveFiles(archive([{name:'root/valid.txt'},{name,type:'5'}])),/Unsafe archive path/,name);
  }
  assert.throws(()=>archiveFiles(archive([{name:'root/file.txt/'}])),/Unsafe archive path/);
});

test('portable release paths refuse Windows aliases, device names and alternate data streams',()=>{
  for(const name of ['file:stream','name.','name ','CON','con.txt','NUL','aux.json','COM1.py','LPT9.txt','bad?name','bad|name'])
    assert.equal(safeRelativePath('root/'+name),false,name);
  for(const name of ['root/normal.txt','root/compound-name_01','root/.gitignore','root/CONTEXT.md'])assert.equal(safeRelativePath(name),true,name);
  for(const names of [['root/README.md','root/readme.md'],['root/Dir/a','root/dir/b'],['root/file','root/file/nested'],['root/file/nested','root/file']])
    assert.throws(()=>archiveFiles(archive(names.map(name=>({name})))),/collision|Duplicate|conflict/i,names.join(', '));
  assert.throws(()=>archiveFiles(archive([{name:'root/file'},{name:'root/file',type:'5'}])),/conflict/i);
});

test('archive extraction rejects a late unsafe entry before writing any valid earlier file',async()=>temporary(async dir=>{
  const target=path.join(dir,'extract');await mkdir(target);
  const sentinel=path.join(dir,'sentinel.txt');await writeFile(sentinel,'unchanged');
  for(const entries of [[{name:'../sentinel.txt',text:'replaced'}],[{name:'root/good.txt'},{name:'root/../../sentinel.txt',text:'replaced'}]]){
    await assert.rejects(extractCompanion(archive(entries),target),/Unsafe archive path/);
    assert.equal(await readFile(sentinel,'utf8'),'unchanged');assert.deepEqual(await readdir(target),[]);
  }
}));

test('ordinary nested release files still extract with identical bytes',async()=>temporary(async dir=>{
  const gz=archive([{name:'release/',type:'5'},{name:'release/py/',type:'5'},{name:'release/py/example.txt',text:'synthetic\n'}]);
  const parsed=archiveFiles(gz);assert.equal(parsed.root,'release');assert.equal(parsed.files.length,1);
  const root=await extractCompanion(gz,path.join(dir,'extract'));
  assert.equal(root,path.join(dir,'extract','release'));assert.equal(sha256(await readFile(path.join(root,'py/example.txt'))),parsed.files[0].sha256);
}));

test('empty archives fail SDK and runtime verification even with consistent archive hashes',async()=>temporary(async dir=>{
  for(const entries of [[],[{name:'release/',type:'5'}]]){
    const gz=archive(entries);assert.throws(()=>archiveFiles(gz),/no regular files/i);
    await writeFile(path.join(dir,'release.tar.gz'),gz);
    const common={version:1,sdkVersion:'0.13.0',sourceCommit:'a'.repeat(40),sourceTreeClean:true,
      archive:{name:'release.tar.gz',root:'release',bytes:gz.length,sha256:sha256(gz)},
      files:[{path:'py/service/app.py',bytes:1,sha256:'b'.repeat(64)}]};
    await writeFile(path.join(dir,'sdk-release.json'),JSON.stringify({...common,format:'datapass.sdk-release',standalone:[],contracts:[]}));
    await writeFile(path.join(dir,'runtime-companion.json'),JSON.stringify({...common,format:'datapass.runtime-companion',publication:{public:false},
      service:{entry:'py/service/app.py',version:'0.5.0',profile:'safe',start:['py/service/app.py','--profile','safe']},requirements:[]}));
    for(const verify of [verifySdkRelease,verifyRuntimeCompanion]){const result=await verify(dir);assert.equal(result.ok,false);assert.match(result.problems.join('\n'),/no regular files/i);}
  }
}));
