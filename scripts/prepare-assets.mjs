import './prepare-fluent-icons.mjs';
import './prepare-parser.mjs';
import './prepare-extensions.mjs';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('public/duckdb',{recursive:true});
for(const file of ['duckdb-mvp.wasm','duckdb-eh.wasm','duckdb-browser-mvp.worker.js','duckdb-browser-eh.worker.js'])await copyFile('node_modules/@duckdb/duckdb-wasm/dist/'+file,'public/duckdb/'+file);
await writeFile('public/_headers',`/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
await copyFile('THIRD_PARTY_NOTICES.md','public/THIRD_PARTY_NOTICES.md');
console.log('DuckDB workers, WASM and signed JSON/Parquet extensions are same-origin assets.');
