import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {drawing,labelBounds,motionBounds} from '../src/framework/motion/geometry.ts';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {modules} from '../clients/motion-reference/modules.ts';

test('both reference scenes keep all settled labels separate in both projections',()=>{
  for(const spec of [pipeline,modules])for(const projection of ['diagram','isometric']){
    const compiled=compileMotion(spec),bounds=motionBounds(compiled,projection);
    for(const frame of compiled.frames){
      const objects=drawing(compiled,frame,projection).objects.filter(o=>o.alpha>0),boxes=objects.map(labelBounds);
      for(let i=0;i<boxes.length;i++){
        const a=boxes[i];assert.ok(a.x>=bounds.x&&a.x+a.width<=bounds.x+bounds.width);assert.ok(a.y>=bounds.y&&a.y+a.height<=bounds.y+bounds.height);
        for(let j=i+1;j<boxes.length;j++){
          const b=boxes[j],overlap=a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
          assert.equal(overlap,false,`${projection} ${frame.id}: ${objects[i].id} / ${objects[j].id}`);
        }
      }
    }
  }
});
test('a displaced token label gets a leader without changing canonical positions or identities',()=>{
  const compiled=compileMotion(modules),before=JSON.stringify(compiled.frames[3]);
  const result=drawing(compiled,compiled.frames[3],'isometric');
  const token=result.objects.find(o=>o.id==='package');assert.equal(token.leader.length,2);
  assert.equal(JSON.stringify(compiled.frames[3]),before);
  assert.deepEqual(drawing(compiled,compiled.frames[3],'isometric'),result);
});
