/** The StorageAdapter facade: three tiers over the existing ports, each reporting its backend honestly. */
import type {BundlePort,KeyValuePort,StorageTierReport} from './ports.ts';
import type {PreferencesSource} from './kv.ts';
import {isKeyValuePort} from './kv.ts';
import type {ResultStoreClient} from './result-store-client.ts';

export type StorageAdapterOptions={
  preferences:PreferencesSource;
  /** A paired local ResultStore client, or null when no runtime is connected. */
  results?:ResultStoreClient|null;
  /** A bundle implementation (none ships with the facade). */
  bundles?:BundlePort|null;
};
export type StorageAdapter={
  /** Tier 1 port, passed unchanged to the existing loaders/savers (workspace, run history). Null when unavailable. */
  readonly preferences:KeyValuePort|null;
  readonly results:ResultStoreClient|null;
  readonly bundles:BundlePort|null;
  tiers():StorageTierReport[];
};

const NO_RESULTS='No local runtime is paired; immutable results are not reachable.';
const NO_BUNDLES='No bundle format is installed in this build.';

export function createStorageAdapter(options:StorageAdapterOptions):StorageAdapter{
  const prefs=options.preferences;
  if(prefs.port!==null&&!isKeyValuePort(prefs.port))throw new Error('preferences: a trusted key-value port is required');
  if(prefs.port===null&&prefs.backend!=='none')throw new Error('preferences: a missing port must report backend "none"');
  const results=options.results??null,bundles=options.bundles??null;
  const reports:StorageTierReport[]=[
    {tier:'preferences',backend:prefs.port?prefs.backend:'none',available:!!prefs.port,reason:prefs.port?null:prefs.reason??'Preferences storage is unavailable.',mutable:true},
    {tier:'results',backend:results?'local-result-store':'none',available:!!results,reason:results?null:NO_RESULTS,mutable:false},
    {tier:'bundles',backend:bundles?'datapass-bundle':'none',available:!!bundles,reason:bundles?null:NO_BUNDLES,mutable:false},
  ];
  Object.freeze(reports);reports.forEach(r=>Object.freeze(r));
  return Object.freeze({preferences:prefs.port,results,bundles,tiers:()=>reports.map(r=>({...r}))});
}
