import {validateNavigation} from '../../src/framework/foundation/navigation.ts';
/** Acceptance fixture, NOT the canonical Galaxy registry or production architecture. */
export const navigation=validateNavigation({
  format:'datapass.navigation',version:1,
  entities:[
    {id:'presentation',label:'Presentation',kind:'application',summary:'Several views consume one result.',external:false},
    {id:'calculation',label:'Calculation',kind:'model',summary:'A source-owned function produces typed rows.',external:false},
    {id:'knowledge',label:'Knowledge',kind:'sources',summary:'Approved excerpts support the explanation.',external:false},
    {id:'storage',label:'Storage',kind:'service',summary:'An example data boundary, not a connected database.',external:false},
    {id:'external-api',label:'External API',kind:'integration',summary:'External providers stay distinct from product components.',external:true},
  ],
  relations:[
    {id:'consumes',from:'presentation',to:'calculation',kind:'depends-on',source:'Synthetic client fixture'},
    {id:'explains',from:'presentation',to:'knowledge',kind:'related',source:'Synthetic client fixture'},
    {id:'reads',from:'calculation',to:'storage',kind:'depends-on',source:'Synthetic client fixture'},
    {id:'connects',from:'storage',to:'external-api',kind:'integrates-with',source:'Synthetic client fixture'},
  ],
  facets:[{id:'system',label:'Whole system',entities:['presentation','calculation','knowledge','storage','external-api']},{id:'internal',label:'Internal components',entities:['presentation','calculation','knowledge','storage']}],
  projections:[{id:'orbit',label:'Orbit'},{id:'dag',label:'Dependency view'},{id:'list',label:'Inventory'}],
  depths:[{id:'overview',label:'L1 Overview'},{id:'focus',label:'L2 Focus'},{id:'evidence',label:'L3 Evidence'}],
});
