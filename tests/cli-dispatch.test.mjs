import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {COMMANDS,PACKAGE_ROOT,npmEquivalent,plan,usage} from '../scripts/datapass.mjs';

// F211: the datapass CLI only dispatches to the existing npm scripts; it adds no logic of its own.
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const pkg=json('package.json'),lock=json('package-lock.json');
const CLI='scripts/datapass.mjs';

test('the command set is exactly the planned one',()=>{
  assert.deepEqual(Object.keys(COMMANDS).sort(),['build','check','concept-validate','context','dev','doctor','new','pack','preview-validate','verify']);
});

test('each command equals its package.json script (same file, same Node flags)',()=>{
  for(const [name,c] of Object.entries(COMMANDS)){
    assert.equal(pkg.scripts[c.npm],npmEquivalent(name),`${name} → npm run ${c.npm}`);
    assert.ok(existsSync(c.script),c.script);
  }
});

test('package.json and the lock declare the same bin',()=>{
  assert.deepEqual(pkg.bin,{datapass:CLI});
  assert.deepEqual(lock.packages[''].bin,pkg.bin);
  assert.match(readFileSync(CLI,'utf8'),/^#!\/usr\/bin\/env node\r?\n/);
});

test('plan spawns this Node with the npm flags from the package root and passes args through',()=>{
  assert.equal(PACKAGE_ROOT,path.resolve('.'));
  const p=plan('build',['wind-reference','--extra']);
  assert.equal(p.command,process.execPath);
  assert.equal(p.cwd,PACKAGE_ROOT);
  assert.deepEqual(p.args,['--experimental-strip-types',path.join(PACKAGE_ROOT,'scripts/build-client.mjs'),'wind-reference','--extra']);
  assert.deepEqual(plan('verify',['dist-sdk']).args,[path.join(PACKAGE_ROOT,'scripts/sdk-verify.mjs'),'dist-sdk']);
  assert.equal(plan('nope'),null);assert.equal(plan('toString'),null);
});

const cli=(args,cwd)=>spawnSync(process.execPath,[path.join(PACKAGE_ROOT,CLI),...args],{cwd,encoding:'utf8'});

test('usage, unknown command and help exit codes',()=>{
  const none=cli([]);assert.equal(none.status,2);assert.match(none.stdout,/Usage: datapass/);
  for(const k of Object.keys(COMMANDS))assert.match(usage(),new RegExp(`\\b${k}\\b`));
  const bad=cli(['nope']);assert.equal(bad.status,2);assert.match(bad.stderr,/Unknown command: nope/);
  assert.equal(cli(['--help']).status,0);
});

test('exit codes propagate and the script runs from the package root whatever the caller cwd',()=>{
  // preview-validate with no file is the script's own usage error (exit 2), unchanged through the dispatcher.
  const direct=spawnSync(process.execPath,['scripts/preview-validate.mjs'],{encoding:'utf8'});
  const viaCli=cli(['preview-validate'],path.join(PACKAGE_ROOT,'tests'));
  assert.notEqual(direct.status,0);
  assert.equal(viaCli.status,direct.status);
  // A real success path, from another cwd: concept-validate resolves the spec relative to the package root.
  const ok=cli(['concept-validate','--strict','spec/concept/v1/example.minimal.concept.json'],path.join(PACKAGE_ROOT,'docs'));
  assert.equal(ok.status,0,ok.stderr);
});
