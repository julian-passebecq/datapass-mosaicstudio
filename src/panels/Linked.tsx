import {useMemo} from 'react';
import {VgPlotChart} from '@sqlrooms/mosaic/dist/VgPlotChart';
import {DataTableExplorer} from '@sqlrooms/mosaic/dist/data-table-explorer/DataTableExplorer';
import type {Spec} from '@sqlrooms/mosaic';
import {useRoomStore,roomStore} from '../store';
import {Header,Loading} from './Common';
import {BlankData} from './Explore';
export default function Linked(){
 const samples=useRoomStore(s=>s.datapass.samples);
 const connection=useRoomStore(s=>s.mosaic.connection),table=useRoomStore(s=>s.db.tables.find(t=>t.tableName==='operations'));
 const selection=useMemo(()=>roomStore.getState().mosaic.getSelection('operations-filter'),[]);
 const params=useMemo(()=>new Map([['filter',selection]]),[selection]);
 const spec=useMemo(()=>({
  data:{operations:{type:'table',query:'SELECT * FROM operations'}},params:{filter:{select:'crossfilter'}},
  vconcat:[
   {plot:[{mark:'dot',data:{from:'operations',filterBy:'$filter'},x:'energy_mwh',y:'revenue_eur',fill:'region',r:3,opacity:.7},{select:'intervalXY',as:'$filter'}],width:620,height:245,xLabel:'Energy / MWh',yLabel:'Revenue / EUR',colorScheme:'tableau10',marginLeft:62},
   {plot:[{mark:'barX',data:{from:'operations',filterBy:'$filter'},x:{sum:'energy_mwh'},y:'region',fill:'region'},{select:'toggleY',as:'$filter'}],width:620,height:175,xLabel:'Energy by region / MWh',yLabel:null,marginLeft:62,colorScheme:'tableau10'}
  ]
 } as Spec),[]);
 if(connection.status==='error')return <div className="notice error" role="alert">Mosaic initialization failed: {String(connection.error)}</div>;
 if(!samples&&!table)return <BlankData purpose="Linked views demonstrate coordinated Mosaic selections on the synthetic operations sample. Load it to use this module."/>;
 if(connection.status!=='ready'||!table)return <Loading/>;
 return <section className="panel-content"><Header eyebrow="Analyze / coordinated views" title="Operations, from marks to rows" detail="Brush the scatterplot or click a region. Both charts and the table share the same Mosaic selection."/><div className="linked-grid"><div className="chart-card" style={{height:510}}><VgPlotChart spec={spec} params={params}/></div><div className="linked-table"><DataTableExplorer tableName={table} selection={selection} pageSize={20} columns={['region','technology','energy_mwh','revenue_eur']}><div className="results-bar"><strong>Linked records</strong><DataTableExplorer.ResetButton/></div><div className="table-scroll"><DataTableExplorer.Table><DataTableExplorer.Header/><DataTableExplorer.Rows/></DataTableExplorer.Table></div><DataTableExplorer.StatusBar/></DataTableExplorer></div></div><p className="footnote">Synthetic fixture &middot; real DuckDB queries &middot; one UWData Mosaic coordinator, not a second DataPass cross-filter engine.</p></section>;
}
