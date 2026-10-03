import {publicationHead,publicationFiles} from './scripts/publication.mjs';
import {capabilityDefines,CAPABILITY_IDS,type CapabilityId} from './src/framework/capabilities';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {existsSync,lstatSync} from 'node:fs';
import {clientRegistryPlugin,clientDirectory} from './scripts/client-plugin';
const id=process.env.STUDIO_CLIENT;if(!id)throw new Error('Use npm run build:client -- <client-id>');
const root=clientDirectory(id),publicPath=path.join(root,'public');
if(existsSync(publicPath)&&lstatSync(publicPath).isSymbolicLink())throw new Error('A client public directory may not be symbolic');
const publication=process.env.STUDIO_PUBLICATION?JSON.parse(process.env.STUDIO_PUBLICATION):null;
const capabilities:CapabilityId[]=JSON.parse(process.env.STUDIO_CAPABILITIES||'[]');
const csp="default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
export default defineConfig({base:'./',define:capabilityDefines(capabilities),publicDir:existsSync(publicPath)?publicPath:false,
  plugins:[react(),clientRegistryPlugin(id),{name:'single-client-entry',transformIndexHtml:{order:'pre',handler(html){if(!publication)throw new Error('Build with build:client to validate publication metadata');return html.replace('/src/main.tsx','/src/client-main.tsx').replace(/<html lang="[^"]*"/,`<html lang="${publication.language}"`).replace(/<title>[^<]*<\/title>/,publicationHead(publication));}},generateBundle(_options,bundle){
if(publication)for(const [fileName,source] of Object.entries(publicationFiles(publication)))this.emitFile({type:'asset',fileName,source});
const modules=Object.values(bundle).flatMap(chunk=>chunk.type==='chunk'?Object.entries(chunk.modules).filter(([,v])=>v.renderedLength>0).map(([id])=>id.replace(/\\/g,'/')):[]);
if(!capabilities.includes('spatial')&&modules.some(id=>id.includes('/node_modules/three/')))throw new Error('Undeclared 3D dependency in this client. Declare spatial for the custom source component.');
if(modules.some(id=>id.includes('/node_modules/@duckdb/')||id.includes('/node_modules/@sqlrooms/')))throw new Error('Client build unexpectedly imports the SQL workbench runtime. Use a separate explicit data adapter.');
this.emitFile({type:'asset',fileName:'studio-build.json',source:JSON.stringify({format:'datapass.client-build',version:1,client:id,capabilities,containsThree:modules.some(id=>id.includes('/node_modules/three/')),note:'Build evidence, not runtime health or access control.'},null,2)});
this.emitFile({type:'asset',fileName:'favicon.svg',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#286b7d"/><text x="5" y="22" fill="white" font-family="sans-serif" font-size="18">dp</text></svg>'});this.emitFile({type:'asset',fileName:'_headers',source:`/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`});}}],
  resolve:{alias:[{find:/^@fluentui\/react-icons$/,replacement:path.resolve('.generated/fluent-icons.js')},{find:'@vizforge',replacement:path.resolve('.upstream/vizforge/src')},...['core','svg','react'].map(name=>({find:'@conceptmotion/'+name,replacement:path.resolve('.upstream/conceptmotion/project/conceptmotion_studio/packages',name,'src/index.ts')}))],dedupe:['react','react-dom']},
  build:{outDir:path.resolve('dist-clients',id),emptyOutDir:true,sourcemap:false,chunkSizeWarningLimit:1200},
  preview:{host:'127.0.0.1',port:4174,headers:{'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}
});
