import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {existsSync,lstatSync} from 'node:fs';
import {clientRegistryPlugin,clientDirectory} from './scripts/client-plugin';
const id=process.env.STUDIO_CLIENT;if(!id)throw new Error('Use npm run build:client -- <client-id>');
const root=clientDirectory(id),publicPath=path.join(root,'public');
if(existsSync(publicPath)&&lstatSync(publicPath).isSymbolicLink())throw new Error('A client public directory may not be symbolic');
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const features: string[]=JSON.parse(process.env.STUDIO_BLOCKS||'[]');
const csp="default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
export default defineConfig({base:'./',define:{__STUDIO_CHARTS__:JSON.stringify(features.includes('chart')),__STUDIO_3D__:JSON.stringify(features.includes('scene3d')),__STUDIO_STORIES__:JSON.stringify(features.some(f=>f==='story-controls'||f==='story-figure')),__STUDIO_ARCHITECTURE__:JSON.stringify(features.includes('architecture')),__STUDIO_EXPLORER__:JSON.stringify(features.includes('explorer')),__STUDIO_EXPLANATIONS__:JSON.stringify(features.includes('explanation'))},publicDir:existsSync(publicPath)?publicPath:false,
  plugins:[react(),clientRegistryPlugin(id),{name:'single-client-entry',transformIndexHtml:{order:'pre',handler(html){return html.replace('/src/main.tsx','/src/client-main.tsx').replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(process.env.STUDIO_TITLE||id)}</title><meta name="description" content="${escapeHtml(process.env.STUDIO_DESCRIPTION||'')}">`);}},generateBundle(){this.emitFile({type:'asset',fileName:'favicon.svg',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#286b7d"/><text x="5" y="22" fill="white" font-family="sans-serif" font-size="18">dp</text></svg>'});this.emitFile({type:'asset',fileName:'_headers',source:`/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`});}}],
  resolve:{alias:[{find:/^@fluentui\/react-icons$/,replacement:path.resolve('.generated/fluent-icons.js')},{find:'@vizforge',replacement:path.resolve('.upstream/vizforge/src')},...['core','svg','react'].map(name=>({find:'@conceptmotion/'+name,replacement:path.resolve('.upstream/conceptmotion/project/conceptmotion_studio/packages',name,'src/index.ts')}))],dedupe:['react','react-dom']},
  build:{outDir:path.resolve('dist-clients',id),emptyOutDir:true,sourcemap:false,chunkSizeWarningLimit:1200},
  preview:{host:'127.0.0.1',port:4174,headers:{'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}
});
