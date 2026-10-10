#!/usr/bin/env node
/**
 * Third-party license inventory (FR-07). Inventory only: it records what each dependency declares, it does not
 * grant, choose or infer any license for this repository.
 *
 *   node scripts/license-inventory.mjs [--python <python with the pinned requirements>] [--installed-report <file>]
 *   node scripts/license-inventory.mjs --check        (npm section of the committed inventory still matches the lock)
 *
 * npm section: every package of package-lock.json (lockfile v3 records the `license` each package declares), so the
 * result is the same on every OS. Python section: the distributions installed in the given interpreter's environment
 * (a venv built from py/service/requirements*.txt), read through importlib.metadata. Upstream engines come from
 * upstreams.lock.json with the license finding recorded in THIRD_PARTY_NOTICES.md.
 * --installed-report writes a local cross-check of node_modules (license files present, declared license differing
 * from the lock); that report is platform dependent and is not committed.
 */
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(import.meta.dirname,'..');
export const INVENTORY_JSON='docs/licenses/third-party-inventory.json';
export const INVENTORY_MD='docs/licenses/THIRD_PARTY_INVENTORY.md';
/** Licenses that allow redistribution with attribution and need no source disclosure. Anything else is listed for review. */
export const PERMISSIVE=Object.freeze(['MIT','ISC','BSD-2-Clause','BSD-3-Clause','Apache-2.0','0BSD','BlueOak-1.0.0','CC0-1.0','Unlicense','Python-2.0','MIT-0','Zlib','PSF-2.0','CC-BY-4.0']);
export const PROJECT_LICENSE=Object.freeze({
  spdx:null,
  finding:'No LICENSE/COPYING file and no package.json "license" field exist in this repository or anywhere in its Git history (checked with git log --all for LICENSE*/COPYING* and the package.json license field).',
  consequence:'No license is granted. The source is publicly visible on GitHub, but visibility is not a license: all rights stay reserved by the owner. Public SDK publication is NOT_AUTHORIZED until the owner decides a license.',
});

const licenseText=v=>{
  if(!v)return null;
  if(typeof v==='string')return v;
  if(Array.isArray(v))return v.map(licenseText).filter(Boolean).join(' OR ')||null;
  if(typeof v==='object'&&typeof v.type==='string')return v.type;
  return null;
};
/** SPDX ids named by an expression such as "(MIT OR Apache-2.0)". */
export const spdxIds=expr=>expr?String(expr).replace(/[()]/g,' ').split(/\s+(?:OR|AND|WITH)\s+|\s+/i).filter(Boolean):[];
/** Permissive when an OR expression offers one permissive choice and an AND expression is permissive throughout. */
export function isPermissive(expr){
  if(!expr)return false;
  const e=String(expr).replace(/[()]/g,'').trim();
  if(/\sOR\s/i.test(e))return e.split(/\s+OR\s+/i).some(isPermissive);
  return e.split(/\s+AND\s+/i).every(x=>PERMISSIVE.includes(x.trim()));
}
const nameFromPath=p=>{const i=p.lastIndexOf('node_modules/');return p.slice(i+'node_modules/'.length);};

export function npmInventory(lock,pkg){
  const direct=new Set([...Object.keys(pkg.dependencies??{}),...Object.keys(pkg.devDependencies??{})]);
  const byId=new Map();
  for(const [p,v] of Object.entries(lock.packages??{})){
    if(!p||v.link)continue;
    const name=v.name??nameFromPath(p),id=name+'@'+v.version;
    const prev=byId.get(id);
    const entry=prev??{name,version:v.version,license:licenseText(v.license),production:false,optional:true,direct:false,paths:0};
    entry.paths++;if(!v.dev)entry.production=true;if(!v.optional&&!v.devOptional)entry.optional=false;if(direct.has(name)&&p==='node_modules/'+name)entry.direct=true;
    byId.set(id,entry);
  }
  return [...byId.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.version<b.version?-1:1);
}

const PY_SNIPPET=String.raw`
import json, importlib.metadata as md
out=[]
for d in md.distributions():
    m=d.metadata
    name=m.get('Name')
    if not name or name.lower() in ('pip',):
        continue
    expr=m.get('License-Expression')
    lic=m.get('License')
    cls=[c.split('::')[-1].strip() for c in (m.get_all('Classifier') or []) if c.startswith('License ::')]
    files=sorted({str(f) for f in (d.files or []) if any(k in str(f).upper() for k in ('LICENSE','COPYING','NOTICE'))})
    out.append({'name':name,'version':d.version,'licenseExpression':expr,'license':(lic or '').strip().splitlines()[0][:200] if lic else None,'classifiers':cls,'licenseFiles':files[:6]})
print(json.dumps(sorted(out,key=lambda x:x['name'].lower())))
`;
const PY_SPDX={'MIT License':'MIT','BSD License':'BSD-3-Clause','Apache Software License':'Apache-2.0','ISC License (ISCL)':'ISC','Python Software Foundation License':'PSF-2.0','Mozilla Public License 2.0 (MPL 2.0)':'MPL-2.0'};
/** Unambiguous spellings of an SPDX id found in the free-text License field. "BSD" alone stays as declared (variant unknown). */
const PY_ALIASES={'Apache 2.0':'Apache-2.0','Apache License 2.0':'Apache-2.0','Apache Software License':'Apache-2.0','PSFL':'PSF-2.0','MIT License':'MIT'};
function pythonLicense(d){
  if(d.licenseExpression)return d.licenseExpression;
  const known=Object.values(PY_SPDX),lic=d.license&&d.license!=='UNKNOWN'?(PY_ALIASES[d.license]??d.license):null;
  if(lic&&(known.includes(lic)||/^[A-Za-z0-9.-]+(\s+(OR|AND)\s+[A-Za-z0-9.-]+)*$/.test(lic)&&lic.length<40))return lic;
  const fromClassifiers=[...new Set(d.classifiers.map(c=>PY_SPDX[c]??c))];
  if(fromClassifiers.length)return fromClassifiers.join(' OR ');
  return lic;
}
export function requirementPins(){
  const pins=[];
  for(const f of ['py/service/requirements.txt','py/service/requirements-jupyter.txt']){
    for(const line of readFileSync(path.join(repo,f),'utf8').split(/\r?\n/)){const m=/^([A-Za-z0-9_.-]+)==([^\s#]+)/.exec(line.trim());if(m)pins.push({name:m[1],version:m[2],file:f});}
  }
  pins.push({name:'duckdb',version:'1.4.3',file:'.github/workflows/ci.yml (test fixtures only)'});
  return pins;
}
export function pythonInventory(python){
  const r=spawnSync(python,['-I','-c',PY_SNIPPET],{encoding:'utf8',maxBuffer:64*1024*1024});
  if(r.status!==0)throw new Error('python metadata read failed: '+(r.stderr||'').slice(-800));
  const pins=requirementPins(),norm=s=>s.toLowerCase().replace(/[-_.]+/g,'-');
  return JSON.parse(r.stdout).map(d=>{
    const pin=pins.find(p=>norm(p.name)===norm(d.name));
    return {name:d.name,version:d.version,license:pythonLicense(d),declared:{licenseExpression:d.licenseExpression,license:d.license,classifiers:d.classifiers},pinned:pin?pin.file:null,licenseFiles:d.licenseFiles};
  });
}

function summary(list,key='license'){
  const counts={};for(const x of list){const k=x[key]??'UNDECLARED';counts[k]=(counts[k]??0)+1;}
  return Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)));
}

export function buildInventory({python=null}={}){
  const lock=JSON.parse(readFileSync(path.join(repo,'package-lock.json'),'utf8')),pkg=JSON.parse(readFileSync(path.join(repo,'package.json'),'utf8'));
  const upstreams=JSON.parse(readFileSync(path.join(repo,'upstreams.lock.json'),'utf8')).sources.map(s=>({...s,license:s.id==='sqlrooms-examples'?'not imported (reference-only audit)':null,
    finding:s.id==='sqlrooms-examples'?'Reference only; no code from this repository is imported.':'No root LICENSE file or package license field was found (THIRD_PARTY_NOTICES.md). Owner-provided DataPass source; no separate grant.'}));
  const npm=npmInventory(lock,pkg);
  const py=python?pythonInventory(python):null;
  return {format:'datapass.license-inventory',version:1,package:{name:pkg.name,version:pkg.version},project:PROJECT_LICENSE,
    publicSdkPublication:'NOT_AUTHORIZED',
    npm:{source:'package-lock.json (lockfileVersion '+lock.lockfileVersion+')',packages:npm.length,production:npm.filter(p=>p.production).length,
      licenses:{production:summary(npm.filter(p=>p.production)),development:summary(npm.filter(p=>!p.production))},
      review:npm.filter(p=>!isPermissive(p.license)).map(p=>({name:p.name,version:p.version,license:p.license,production:p.production})),list:npm},
    python:py?{source:'importlib.metadata of a venv built from py/service/requirements.txt + requirements-jupyter.txt + duckdb==1.4.3 (CI fixtures)',pins:requirementPins(),distributions:py.length,
      licenses:summary(py),review:py.filter(p=>!isPermissive(p.license)).map(p=>({name:p.name,version:p.version,license:p.license,declared:p.declared})),list:py.map(({licenseFiles,...x})=>x)}:null,
    upstreams};
}

function markdown(inv){
  const rows=o=>Object.entries(o).map(([k,v])=>`| ${k} | ${v} |`).join('\n');
  const lines=[`# Third-party license inventory (${inv.package.name} ${inv.package.version})`,'',
    'Generated by `node scripts/license-inventory.mjs --python <venv python>` from `package-lock.json` and the pinned Python requirements. It records what each dependency **declares**. It is not legal advice and it grants nothing. Full list: [`third-party-inventory.json`](third-party-inventory.json). Prose notices: [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).','',
    '## This repository','',`- License: **none** (${inv.project.finding})`,`- ${inv.project.consequence}`,`- Public SDK publication: **${inv.publicSdkPublication}**.`,'',
    '## Upstream engines (upstreams.lock.json)','','| id | repository | commit | license finding |','|---|---|---|---|',
    ...inv.upstreams.map(u=>`| ${u.id} | ${u.repository} | \`${u.commit.slice(0,12)}\` | ${u.finding} |`),'',
    `## npm (${inv.npm.packages} packages, ${inv.npm.production} in the production tree)`,'','Production dependency tree (what `npm ci --omit=dev` installs). Browser builds bundle only modules the code imports; platform-native optional packages in this tree (for example `@img/sharp-*`, used by Node tooling) are never bundled into browser output or the SDK archive:','','| License | Packages |','|---|---|',rows(inv.npm.licenses.production),'',
    'Development only:','','| License | Packages |','|---|---|',rows(inv.npm.licenses.development),'',
    'Not in the permissive list, for review before any redistribution:','','| Package | Version | Declared | Production |','|---|---|---|---|',
    ...inv.npm.review.map(p=>`| ${p.name} | ${p.version} | ${p.license??'UNDECLARED'} | ${p.production?'yes':'no'} |`),''];
  if(inv.python){
    lines.push(`## Python (${inv.python.distributions} distributions in the pinned venv)`,'','Direct pins: '+inv.python.pins.map(p=>`\`${p.name}==${p.version}\``).join(', ')+'.','','| License | Distributions |','|---|---|',rows(inv.python.licenses),'',
      'Not in the permissive list, for review:','','| Distribution | Version | Resolved | Declared |','|---|---|---|---|',
      ...inv.python.review.map(p=>`| ${p.name} | ${p.version} | ${p.license??'UNDECLARED'} | ${[p.declared.licenseExpression,p.declared.license,...p.declared.classifiers].filter(Boolean).join('; ').slice(0,120)||'none'} |`),'',
      'The Python packages are not bundled into any browser build or SDK archive; they are installed by the user into their own venv for the optional local service.','');
  }else lines.push('## Python','','Not generated in this run (pass `--python`).','');
  return lines.join('\n');
}

function installedReport(lock){
  const out=[];
  for(const [p,v] of Object.entries(lock.packages??{})){
    if(!p||v.link)continue;const dir=path.join(repo,...p.split('/'));if(!existsSync(dir)){out.push({path:p,installed:false});continue;}
    let declared=null;try{declared=licenseText(JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).license??JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).licenses);}catch{/* no package.json */}
    const files=readdirSync(dir).filter(f=>/^(licen[cs]e|copying|notice)/i.test(f));
    out.push({path:p,installed:true,lock:licenseText(v.license),declared,mismatch:licenseText(v.license)!==declared,licenseFiles:files});
  }
  return out;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let python=null,check=false,report=null;
  for(let i=0;i<args.length;i++){if(args[i]==='--python'&&args[i+1])python=args[++i];else if(args[i]==='--check')check=true;else if(args[i]==='--installed-report'&&args[i+1])report=path.resolve(args[++i]);else{console.error('Usage: node scripts/license-inventory.mjs [--python <python>] [--installed-report <file>] | --check');process.exit(2);}}
  if(check){
    const committed=JSON.parse(readFileSync(path.join(repo,INVENTORY_JSON),'utf8')),fresh=buildInventory();
    const same=JSON.stringify(committed.npm)===JSON.stringify(fresh.npm)&&committed.package.version===fresh.package.version;
    if(!same){console.error(`${INVENTORY_JSON} is stale for package-lock.json: run node scripts/license-inventory.mjs --python <venv python>.`);process.exit(1);}
    console.log(`License inventory matches the lock: ${fresh.npm.packages} npm packages, ${fresh.npm.review.length} to review.`);process.exit(0);
  }
  if(!python&&existsSync(path.join(repo,INVENTORY_JSON))){console.error('Refusing to drop the committed Python section: pass --python <venv python>.');process.exit(2);}
  const inv=buildInventory({python});
  await mkdir(path.join(repo,'docs/licenses'),{recursive:true});
  await writeFile(path.join(repo,INVENTORY_JSON),JSON.stringify(inv,null,1)+'\n');
  await writeFile(path.join(repo,INVENTORY_MD),markdown(inv));
  if(report){const lock=JSON.parse(readFileSync(path.join(repo,'package-lock.json'),'utf8'));await writeFile(report,JSON.stringify(installedReport(lock),null,1)+'\n');}
  console.log(`License inventory: ${inv.npm.packages} npm packages (${inv.npm.review.length} to review)${inv.python?`, ${inv.python.distributions} Python distributions (${inv.python.review.length} to review)`:''}. Project license: none; public SDK publication NOT_AUTHORIZED.`);
}
