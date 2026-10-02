import type {ReplaySpec} from './model.ts';
/** Use existing VizForge time-series grammar, splitting gaps into distinct series.
 * A null is never converted to zero, and missing intervals are never joined.
 */
export function replayChartInput(spec:ReplaySpec,entity:string,channelId:string){
  const channel=spec.channels.find(c=>c.id===channelId),item=spec.entities.find(e=>e.id===entity);
  if(!channel||!item)throw new Error('Unknown replay chart selection');
  const rows:{id:string;label:string;time:number;value:number}[]=[];let segment=0,last=-1;
  channel.values[entity].forEach((value,i)=>{
    if(value===null){last=-1;return;}
    if(last<0||spec.time[i]-spec.time[last]>spec.maxGapSeconds)segment++;
    rows.push({id:'segment-'+segment,label:item.label,time:spec.time[i],value});last=i;
  });
  if(!rows.length)return null;
  return {id:'replay-channel',version:'1.0',type:'time-series',title:channel.label,subtitle:item.label+' / elapsed seconds',source:spec.source,takeaway:'Cursor, plan and measurements use the same supplied sample.',
    note:segment>1?'Gaps split the line. Segment endpoints are historical values, not filled-in observations.':'No interpolated data. Playback is a read-only inspection of supplied samples.',
    accessibility:{summary:channel.label+' recorded at '+rows.length+' supplied samples; missing values stay missing.'},formatting:{digits:channel.digits,unit:channel.unit},
    data:rows,encodings:{id:'id',label:'label',time:'time',value:'value'},xDomain:[spec.time[0],spec.time.at(-1)!],yDomain:channel.domain};
}
