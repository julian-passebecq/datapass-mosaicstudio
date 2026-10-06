import test from 'node:test';
import assert from 'node:assert/strict';
import {withSiteChartTheme,siteSemanticTheme} from '../src/framework/visual-theme.ts';
test('light chart inputs preserve the original grammar and theme identity',()=>{const input={id:'chart',theme:{ink:'#111111'}};assert.equal(withSiteChartTheme(input,{accent:'#123456',density:'compact'}),input);});
test('dark chart adapter is immutable and uses the established VizForge theme fields',()=>{const input={id:'chart'},theme={mode:'dark',accent:'#123456',density:'compact'};const result=withSiteChartTheme(input,theme);assert.equal(result.theme.palette[0],theme.accent);assert.equal(result.theme.background,'#0f1b29');assert.equal(input.theme,undefined);});
test('semantic theme adapts only presentation rather than modifying source frames',()=>{const dark=siteSemanticTheme({mode:'dark',accent:'#123456',density:'compact'});assert.equal(dark.accent,'#123456');assert.equal(dark.surface,'#111f2e');assert.deepEqual(siteSemanticTheme({accent:'#123456',density:'compact'}),{accent:'#123456'});});
