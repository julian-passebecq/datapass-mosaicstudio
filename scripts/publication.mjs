import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
const escape=(s)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))throw new Error('Invalid publication '+label);return v;};
export function validatePublication(input,defaults){
  const d=input??{format:'datapass.publication',version:1,visibility:'preview',language:'en'};
  if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['format','version','visibility','language','title','description','canonicalUrl','image'].includes(k)))throw new Error('Invalid publication profile');
  if(d.format!=='datapass.publication'||d.version!==1||!['preview','public'].includes(d.visibility))throw new Error('Unsupported publication profile');
  if(typeof d.language!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(d.language))throw new Error('Invalid publication language');
  const result={format:d.format,version:1,visibility:d.visibility,language:d.language,title:text(d.title??defaults.title,160,'title'),description:text(d.description??defaults.description??'A DataPass client application.',2000,'description')};
  if(d.canonicalUrl!==undefined){
    text(d.canonicalUrl,2048,'URL');const url=new URL(d.canonicalUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Canonical URL must be public HTTPS without credentials, query or fragment');
    result.canonicalUrl=url.href;
  }
  if(d.visibility==='public'&&!result.canonicalUrl)throw new Error('Public metadata requires an explicit canonical URL');
  if(d.image!==undefined){
    text(d.image,200,'image');
    if(!/^[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/.test(d.image)||d.image.startsWith('/')||d.image.split('/').some(s=>!s||s==='.'||s==='..'))throw new Error('Social image must be a safe relative PNG/JPEG/WebP path');
    if(!result.canonicalUrl)throw new Error('Social image needs a canonical URL');
    result.image=d.image;
  }
  return Object.freeze(result);
}
/** Source-owned build metadata, never an arbitrary remote resource fetch. */
export async function readPublication(clientRoot,defaults){
  let input;const file=path.join(clientRoot,'publication.json');
  try{const info=await lstat(file);if(info.isSymbolicLink()||info.size>16384)throw new Error('Unsafe or oversized publication profile');input=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const profile=validatePublication(input,defaults);
  if(profile.image){
    const publicRoot=path.join(clientRoot,'public');const publicInfo=await lstat(publicRoot);if(publicInfo.isSymbolicLink())throw new Error('Symbolic public folder refused');
    let current=publicRoot;for(const segment of profile.image.split('/')){current=path.join(current,segment);if((await lstat(current)).isSymbolicLink())throw new Error('Symbolic social asset refused');}
    const base=await realpath(publicRoot),asset=await realpath(current);if(!asset.startsWith(base+path.sep))throw new Error('Social asset leaves client public folder');
    const stat=await lstat(asset);if(!stat.isFile()||stat.size>1048576)throw new Error('Social image budget is 1 MiB');
  }
  return profile;
}
export function publicationHead(profile){
  const p=validatePublication(profile,profile),tag=(name,value)=>`<meta ${name.startsWith('og:')?'property':'name'}="${name}" content="${escape(value)}">`;
  return `<title>${escape(p.title)}</title>`+tag('description',p.description)+tag('robots',p.visibility==='public'?'index,follow':'noindex,nofollow')+tag('og:type','website')+tag('og:title',p.title)+tag('og:description',p.description)+tag('og:locale',p.language.replaceAll('-','_'))+tag('twitter:card',p.image?'summary_large_image':'summary')+(p.canonicalUrl?`<link rel="canonical" href="${escape(p.canonicalUrl)}">`+tag('og:url',p.canonicalUrl):'')+(p.image?tag('og:image',new URL(p.image,p.canonicalUrl).href):'');
}
export function publicationFiles(profile){
  const p=validatePublication(profile,profile);
  return {'robots.txt':`User-agent: *\n${p.visibility==='public'?'Allow: /':'Disallow: /'}\n`,'studio-publication.json':JSON.stringify({...p,note:'Static metadata only. Robots directives are not access control. No deployment, domain verification or server-side rendering was performed.'},null,2)+'\n'};
}
