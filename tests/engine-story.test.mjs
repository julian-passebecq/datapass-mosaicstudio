import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';
import {loadClient} from '../scripts/load-client.mjs';
import {addModelStoryConsumer} from './engine-fixtures.mjs';

// Exercise the actual pinned parser/player against the generated cross-renderer
// fixture. A source/typecheck pass alone did not validate its opaque Story spec.
await mkdir('.generated',{recursive:true});
const output=path.resolve('.generated/engine-story-test.mjs');
await build({entryPoints:['.upstream/vizforge/src/core/player.ts'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {StoryPlayer}=await import(pathToFileURL(output).href);

test('generated model/custom story obeys the pinned player contract before browser work',async()=>{
  const id='engine-story-check-'+process.pid;
  await scaffoldClient({id,family:'spatial',model:true,custom:true});
  try{
    await addModelStoryConsumer(id);
    const definition=await loadClient(id),resource=definition.resources.stories.engineStory;
    const jobs=new Map();let next=0;
    const scheduler={set(fn,delay){const id=++next;jobs.set(id,{fn,delay});return id;},clear(id){jobs.delete(id);}};
    const player=new StoryPlayer(resource.spec,false,scheduler);
    try{
      assert.equal(player.story.scenes.length,3);
      assert.equal(jobs.size,0);
      player.play();assert.equal(jobs.size,1);
      assert.equal([...jobs.values()][0].delay,player.story.intervalMs);
      player.pause();assert.equal(jobs.size,0);
      for(let i=0;i<player.story.scenes.length;i++){
        player.seek(i);
        assert.ok(resource.cues[player.getScene().id]);
        assert.equal(player.getState().index,i);
        assert.equal(jobs.size,0);
      }
      assert.throws(()=>new StoryPlayer({...resource.spec,intervalMs:800}),/intervalMs/);
    }finally{player.dispose();}
  }finally{await rm('clients/'+id,{recursive:true,force:true});}
});
