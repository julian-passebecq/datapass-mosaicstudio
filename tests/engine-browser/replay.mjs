import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

export async function testReplay({served,step,expect,id,snapshot,output,report,sha}){
    await served(id('replay'),async({page,requests})=>{
      await step('controlled React Flow and native plan use the same replay selection',async()=>{await expect(page.locator('.react-flow__node')).toHaveCount(2);await page.locator('.react-flow__node[data-id="unit-b"]').click();await expect(page.getByTestId('replay')).toHaveAttribute('data-selection','unit-b');await page.getByRole('button',{name:'Select installation Unit A',exact:true}).click();await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-selection','unit-a');await expect(page.locator('.react-flow__node[data-id="unit-a"]')).toHaveClass(/selected/);});
      await step('custom readout and graph preserve the original missing sample and timestamp',async()=>{await page.getByRole('button',{name:'Graph select Unit B',exact:true}).click();await page.getByRole('button',{name:'Go to event Missing observation',exact:true}).click();await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-frame','2');await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-time','2');await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-value','missing');await expect(page.locator('.replay-trace')).toHaveAttribute('data-cursor','2');await expect(page.locator('.react-flow__node[data-id="unit-b"]')).toContainText('Unavailable');for(let i=0;i<3;i++){await page.getByRole('button',{name:'Use readout only',exact:true}).click();await expect(page.locator('.react-flow__node')).toHaveCount(0);await page.getByRole('button',{name:'Show controlled graph',exact:true}).click();await expect(page.locator('.react-flow__node[data-id="unit-b"]')).toHaveClass(/selected/);}await snapshot(page,'replay-missing-sample');});
      await step('manual custom graph selection pauses the original replay controller',async()=>{await page.getByRole('button',{name:'Restart replay',exact:true}).click();await page.getByRole('button',{name:'Play replay',exact:true}).click();await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-frame','1');await page.getByRole('button',{name:'Graph select Unit A',exact:true}).click();await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-playing','false');const frame=await page.getByTestId('replay-consumer').getAttribute('data-frame');await delay(1200);await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-frame',frame);assert.ok(!requests.some(url=>/SceneViewport|ModelViewport|\.glb/.test(url)));});
      await step('replay and controlled graph remain within a 320-pixel viewport',async()=>{
        const framed=async()=>{await expect(page.getByTestId('replay-graph-surface')).toHaveAttribute('data-capture-state','ready');await page.waitForFunction(()=>{
          const surface=document.querySelector('[data-testid="replay-graph-surface"]'),bounds=surface?.getBoundingClientRect(),nodes=surface?.querySelectorAll('.react-flow__node');
          return !!bounds&&nodes?.length===2&&[...nodes].every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1;});
        });};
        await page.setViewportSize({width:320,height:760});await framed();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Replay/custom graph overflows at 320px');
        const frame=await page.getByTestId('replay-consumer').getAttribute('data-frame');
        await page.locator('.react-flow__node[data-id="unit-b"]').click();
        await expect(page.getByTestId('replay')).toHaveAttribute('data-selection','unit-b');
        await expect(page.getByTestId('replay-consumer')).toHaveAttribute('data-frame',frame);
        await page.setViewportSize({width:1440,height:1000});await framed();
        await page.setViewportSize({width:320,height:760});await framed();
        await expect(page.locator('.react-flow__node[data-id="unit-b"]')).toHaveClass(/selected/);
        await snapshot(page,'replay-320px');
      });
    },{reduced:'no-preference'});
}
