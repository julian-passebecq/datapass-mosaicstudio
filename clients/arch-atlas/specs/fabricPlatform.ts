import type {ArchSpec} from '../spec.ts';

/**
 * A Fabric-like unified data platform, with generic names and no product logos.
 * SYNTHETIC: an illustrative arrangement of common concepts, not a description of any tenant or vendor offering.
 */
export const fabricPlatform:ArchSpec={
  format:'datapass.arch-atlas',version:1,id:'fabric-platform',
  title:'Unified data platform',
  subtitle:'One shared lake underneath; every workload sits at its own height above it.',
  provenance:'synthetic',
  note:'SYNTHETIC illustration of a Fabric-like platform. Generic names, no logos; not a vendor reference architecture or a real tenant.',
  layers:[
    {id:'lake',label:'Shared lake',role:'storage',description:'One logical lake. Every item keeps its tables as open columnar files here, so engines read one copy instead of duplicating it.'},
    {id:'items',label:'Data items',role:'data',description:'Stores that live on the lake: lakehouse, warehouse and event store, plus the external systems that feed them.'},
    {id:'engines',label:'Engines',role:'compute',description:'Compute that moves and shapes data: pipelines, notebooks and event streams.'},
    {id:'models',label:'Models & endpoints',role:'serving',description:'Business meaning and access: semantic models, query endpoints and identity.'},
    {id:'apps',label:'Reports & apps',role:'experience',description:'What people open: reports, live dashboards, alert rules and partner apps.'},
    {id:'people',label:'People',role:'users',description:'Analysts and operators who read and act on the results.'}
  ],
  groups:[
    {id:'sources',label:'External sources',description:'Systems outside the platform that produce data.'},
    {id:'sales',label:'Sales domain',description:'Batch analytics workspace: orders to revenue reports.'},
    {id:'ops',label:'Operations domain',description:'Real-time workspace: sensor readings to live dashboards and alerts.'},
    {id:'platform',label:'Platform',description:'Cross-cutting identity and external consumers.'}
  ],
  nodes:[
    {id:'shared-lake',label:'Shared lake',kind:'lake',layer:'lake',group:'sales',purpose:'Single storage layer for every workspace. Tables are kept once as open columnar (Delta/Parquet) files; each engine reads the same copy.',sources:[]},
    {id:'erp-db',label:'ERP database',kind:'database',layer:'items',group:'sources',purpose:'Operational system of record for orders and customers. Read by a scheduled copy; never written by the platform.',sources:[]},
    {id:'sensor-fleet',label:'Plant sensors',kind:'device',layer:'items',group:'sources',purpose:'Field devices that emit temperature and vibration readings every few seconds.',sources:[]},
    {id:'sales-lakehouse',label:'Sales lakehouse',kind:'lakehouse',layer:'items',group:'sales',purpose:'Raw (bronze) and cleaned (silver) tables for the sales domain, stored as files in the shared lake.',sources:[]},
    {id:'sales-warehouse',label:'Sales warehouse',kind:'warehouse',layer:'items',group:'sales',purpose:'Curated (gold) star schema with SQL tables for reporting.',sources:[]},
    {id:'ops-eventhouse',label:'Telemetry store',kind:'eventhouse',layer:'items',group:'ops',purpose:'Time-partitioned event store optimised for recent-window queries over sensor readings.',sources:[]},
    {id:'ingest-pipeline',label:'Nightly copy',kind:'pipeline',layer:'engines',group:'sales',purpose:'Scheduled pipeline that copies changed ERP rows into the lakehouse raw zone.',sources:[]},
    {id:'clean-notebook',label:'Cleaning notebook',kind:'notebook',layer:'engines',group:'sales',purpose:'Spark notebook that deduplicates and types raw tables into silver, then builds gold aggregates.',sources:[]},
    {id:'sensor-stream',label:'Sensor stream',kind:'stream',layer:'engines',group:'ops',purpose:'Event stream that receives device readings, filters them and routes them into the telemetry store.',sources:[]},
    {id:'sales-model',label:'Sales model',kind:'semantic-model',layer:'models',group:'sales',purpose:'Semantic model: relationships, measures (revenue, margin) and row-level rules over the warehouse.',sources:[]},
    {id:'sql-endpoint',label:'Query endpoint',kind:'api',layer:'models',group:'platform',purpose:'Read-only SQL/GraphQL endpoint that exposes curated tables to applications.',sources:[]},
    {id:'workspace-identity',label:'Workspace identity',kind:'identity',layer:'models',group:'platform',purpose:'Single sign-on and workspace roles. Every report, endpoint and item checks it before answering.',sources:[]},
    {id:'sales-report',label:'Revenue report',kind:'report',layer:'apps',group:'sales',purpose:'Interactive report on the sales model: revenue by region, month and product.',sources:[]},
    {id:'ops-dashboard',label:'Live dashboard',kind:'dashboard',layer:'apps',group:'ops',purpose:'Auto-refreshing tiles over the last hour of sensor readings.',sources:[]},
    {id:'ops-alert',label:'Threshold alert',kind:'alert',layer:'apps',group:'ops',purpose:'Rule that fires when a reading crosses its threshold and notifies the on-call operator.',sources:[]},
    {id:'partner-app',label:'Partner web app',kind:'browser',layer:'apps',group:'platform',purpose:'External web application that reads curated data through the query endpoint.',sources:[]},
    {id:'analysts',label:'Analysts',kind:'users',layer:'people',group:'sales',purpose:'Business analysts who explore revenue and share findings.',sources:[]},
    {id:'operators',label:'Operators',kind:'users',layer:'people',group:'ops',purpose:'Plant operators who watch live readings and respond to alerts.',sources:[]}
  ],
  edges:[
    {id:'e-erp-copy',from:'erp-db',to:'ingest-pipeline',kind:'data',label:'Changed rows'},
    {id:'e-copy-land',from:'ingest-pipeline',to:'sales-lakehouse',kind:'data',label:'Land raw'},
    {id:'e-lh-clean',from:'sales-lakehouse',to:'clean-notebook',kind:'data',label:'Read raw'},
    {id:'e-clean-wh',from:'clean-notebook',to:'sales-warehouse',kind:'data',label:'Write gold'},
    {id:'e-wh-model',from:'sales-warehouse',to:'sales-model',kind:'data',label:'Star schema'},
    {id:'e-wh-sql',from:'sales-warehouse',to:'sql-endpoint',kind:'data',label:'Query'},
    {id:'e-model-report',from:'sales-model',to:'sales-report',kind:'data',label:'Measures'},
    {id:'e-sql-partner',from:'sql-endpoint',to:'partner-app',kind:'data',label:'JSON'},
    {id:'e-sensor-stream',from:'sensor-fleet',to:'sensor-stream',kind:'data',label:'Readings'},
    {id:'e-stream-eh',from:'sensor-stream',to:'ops-eventhouse',kind:'data',label:'Ingest'},
    {id:'e-eh-dash',from:'ops-eventhouse',to:'ops-dashboard',kind:'data',label:'Live query'},
    {id:'e-eh-alert',from:'ops-eventhouse',to:'ops-alert',kind:'data',label:'Watch'},
    {id:'e-report-analysts',from:'sales-report',to:'analysts',kind:'data',label:'Read'},
    {id:'e-dash-operators',from:'ops-dashboard',to:'operators',kind:'data',label:'Watch'},
    {id:'e-alert-operators',from:'ops-alert',to:'operators',kind:'control',label:'Notify'},
    {id:'e-id-sql',from:'workspace-identity',to:'sql-endpoint',kind:'control',label:'Authorize'},
    {id:'e-id-report',from:'workspace-identity',to:'sales-report',kind:'control',label:'Sign in'}
  ]
};
