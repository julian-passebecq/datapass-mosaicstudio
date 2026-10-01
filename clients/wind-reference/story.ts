import type {StoryResource} from '../../src/framework/types.ts';
/** Original VizForge StorySpec plus a small adapter mapping scene ids to view fields. */
export const assemblyStory:StoryResource={indexField:'storyStep',spec:{
  id:'wind-system-story',version:'1.0',title:'Understand the turbine',description:'A controlled visual explanation across 3D, chart and narrative.',intervalMs:5000,
  visuals:[{
    id:'composition',version:'1.0',type:'ranking',title:'Illustrative installed cost mix',subtitle:'Share of a hypothetical project, not a quotation',takeaway:'Different components carry different cost drivers.',source:'Synthetic framework example',note:'Static illustrative proportions; the economics page has separate editable assumptions.',accessibility:{summary:'Four hypothetical component shares totaling 100 percent'},formatting:{digits:0,unit:'%'},
    data:[{id:'foundation',label:'Foundation',time:0,value:24},{id:'tower',label:'Tower',time:0,value:16},{id:'rotor',label:'Rotor',time:0,value:23},{id:'nacelle',label:'Nacelle and systems',time:0,value:37}],encodings:{id:'id',label:'label',time:'time',value:'value'},topN:4,
    annotations:[{id:'rotor-note',text:'Blade and rotor design affects energy capture.',entityId:'rotor'},{id:'system-note',text:'The drivetrain converts mechanical into electrical power.',entityId:'nacelle'}]
  }],
  scenes:[
    {id:'assembled',visualId:'composition',title:'One system, connected views',caption:'Start with the assembled turbine. The 3D viewport, highlighted chart and this explanation use one shared story controller.'},
    {id:'rotor-focus',visualId:'composition',title:'Explore the rotor',caption:'The hub and blades move together. The chart emphasizes the same rotor concept; selection remains available from both the 3D model and accessible buttons.',focusIds:['rotor'],annotationIds:['rotor-note']},
    {id:'drivetrain-focus',visualId:'composition',title:'Open the nacelle',caption:'The housing separates to expose the generator. This is an illustrative assembly animation, not a physics simulation or engineering validation.',focusIds:['nacelle'],annotationIds:['system-note']},
    {id:'reassemble',visualId:'composition',title:'From explanation to analysis',caption:'Reassemble the system, then open Economics to change model inputs. Moving the camera or stepping through this story does not recompute the financial model.'}
  ]
},cues:{
  assembled:{explode:0,phase:0,camera:'iso',selection:'none'},
  'rotor-focus':{explode:.25,phase:.22,camera:'front',selection:'rotor'},
  'drivetrain-focus':{explode:1,phase:.35,camera:'drivetrain',selection:'generator'},
  reassemble:{explode:0,phase:.7,camera:'iso',selection:'none'}
}};
