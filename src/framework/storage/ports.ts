/** StorageAdapter ports (F204). A facade over the stores that already exist; it adds no backend.
 * Tier 1 `preferences`: browser key-value preferences and metadata (the workspace document, run-history references).
 * Tier 2 `results`: immutable, content-addressed results held by the local ResultStore (`/api/notebook/v1/store/*`),
 *   read back and verified against their hash. The ResultStore stays authoritative; nothing is cached or copied.
 * Tier 3 `bundles`: exportable bundles. Only the interface lives here; an implementation arrives with the bundle format.
 * Not provided: IndexedDB, remote stores, sync. */

/** Same shape as the workspace `StoragePort` and the foundation `RunHistoryStore` (localStorage satisfies it). */
export type KeyValuePort={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};

export type StorageTierId='preferences'|'results'|'bundles';
/** The backends this facade knows. `none` means the tier is not available here, with a reason. */
export type StorageBackend='localStorage'|'memory'|'local-result-store'|'none';
export type StorageTierReport={tier:StorageTierId;backend:StorageBackend;available:boolean;reason:string|null;
  /** Whether stored entries can change in place (preferences) or are immutable and hash-addressed (results). */
  mutable:boolean};

/** Tier 3 contract. A bundle is a file set the user exports deliberately; it is never written implicitly. */
export type BundleEntry={path:string;bytes:Uint8Array;sha256:string};
export interface BundlePort{
  readonly format:string;readonly version:number;
  /** Build the file set; the caller decides where it goes (download, file picker). */
  exportBundle(input:unknown):Promise<BundleEntry[]>;
  /** Validate a file set completely before anything changes; throws on any mismatch. */
  importBundle(entries:readonly BundleEntry[]):Promise<unknown>;
}
