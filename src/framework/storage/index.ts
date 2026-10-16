/** StorageAdapter facade (F204): three tiers over the existing ports. No React, renderer or task execution on import. */
export type {KeyValuePort,StorageTierId,StorageBackend,StorageTierReport,BundleEntry,BundlePort} from './ports.ts';
export {browserPreferences,memoryPreferences,memoryKeyValue,isKeyValuePort} from './kv.ts';
export type {PreferencesSource,MemoryKeyValue} from './kv.ts';
export {ResultStoreClient,ResultStoreError,readArtifactResult,resultStoreOrigin,sha256Hex,RESULT_FORMAT,RESULT_STORE_FORMAT,RESULT_STORE_PREFIX,ARTIFACT_MIME,RUNTIME_RESULT_ORIGIN} from './result-store-client.ts';
export type {StoredArtifactResult,StoredRunRef,ResultStoreEntry} from './result-store-client.ts';
export {createStorageAdapter} from './tiers.ts';
export type {StorageAdapter,StorageAdapterOptions} from './tiers.ts';
export {SiteRunStore,SiteRunError,siteRunItem,siteSourceSha256,relinkCandidates} from './site-runs.ts';
export type {SiteApp,SiteRunIdentity,SiteRunRef,SiteRunItem,SiteRunDocument,SavedSiteRun,ReopenedSiteRun,SiteRunErrorKind} from './site-runs.ts';
export {SITE_CELL_PREFIX,siteCellId,validateDurableRunsBindings} from './site-runs-binding.ts';
export type {DurableRunsBinding} from './site-runs-binding.ts';
export {AB_PAIR_FORMAT,AB_PAIR_VERSION,AbPairError,abPairKey,validateAbPair,abCompatibility,createAbPair,loadAbPair,saveAbPair,clearAbPair,compareSavedRuns,deltaArtifact,openAbPair} from './ab-pairs.ts';
export type {AbSide,AbPair,AbPairErrorKind,AbCompatibility,SavedComparison,ReopenedAbPair} from './ab-pairs.ts';
