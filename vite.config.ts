import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
const base=path.resolve('.upstream/conceptmotion/project/conceptmotion_studio/packages');
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'";
export default defineConfig(({command})=>({
  base:'./',plugins:[react(),tailwind()],
  resolve:{alias:[...(command==='serve'?[{find:/^node-sql-parser$/,replacement:path.resolve('public/vendor/sql-parser.mjs')}]:[]),{find:/^@fluentui\/react-icons$/,replacement:path.resolve('.generated/fluent-icons.js')},{find:'@vizforge',replacement:path.resolve('.upstream/vizforge/src')},...['core','svg','react'].map(name=>({find:'@conceptmotion/'+name,replacement:base+'/'+name+'/src/index.ts'})),{find:'@datapass/content',replacement:base+'/content/src/index.ts'}],dedupe:['react','react-dom']},
  optimizeDeps:{exclude:['@duckdb/duckdb-wasm']},
  build:{sourcemap:false,chunkSizeWarningLimit:2000,rollupOptions:{external:['node-sql-parser'],output:{paths:{'node-sql-parser':'../vendor/sql-parser.mjs'}}}},
  server:{host:'127.0.0.1',port:5173},
  preview:{host:'127.0.0.1',port:4173,headers:{'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}
}));
