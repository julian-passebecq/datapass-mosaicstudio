/** Resolve used Fluent icon names to PUBLIC per-icon exports, without copying icons.
 * The umbrella package has more than 11,000 modules; this keeps bounded-memory builds practical.
 * Unknown exports fail the build rather than replacing icons with stubs.
 */
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
async function walk(root){let out=[];for(const item of await readdir(root,{withFileTypes:true})){if(item.name==='react-icons'||item.name==='node_modules')continue;const p=path.join(root,item.name);if(item.isDirectory())out.push(...await walk(p));else if(p.endsWith('.js')&&!p.includes('lib-commonjs'))out.push(p);}return out;}
const names=new Set();
for(const file of await walk('node_modules/@fluentui')){const text=await readFile(file,'utf8');for(const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@fluentui\/react-icons['"]/g)){for(const item of match[1].split(',')){const name=item.trim().split(/\s+as\s+/)[0];if(name)names.add(name);}}}
const atoms='node_modules/@fluentui/react-icons/lib/atoms/svg',index=new Map();
for(const file of await readdir(atoms)){if(!file.endsWith('.js'))continue;const text=await readFile(path.join(atoms,file),'utf8');for(const match of text.matchAll(/export const (\w+)\s*=/g))index.set(match[1],file.slice(0,-3));}
const utilities=new Set(['bundleIcon','iconFilledClassName','iconRegularClassName','iconClassName','createFluentIcon','wrapIcon','useIconState']);
const lines=['// Generated from the locked Fluent packages. No icon geometry is copied.'];
for(const name of [...names].sort()){if(index.has(name))lines.push(`export {${name}} from '@fluentui/react-icons/svg/${index.get(name)}';`);else if(utilities.has(name))lines.push(`export {${name}} from '@fluentui/react-icons/utils';`);else throw new Error('Unmapped Fluent icon export: '+name);}
await mkdir('.generated',{recursive:true});await writeFile('.generated/fluent-icons.js',lines.join('\n')+'\n');
console.log(`Mapped ${names.size} actual Fluent icon exports to public subpaths.`);
