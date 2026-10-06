import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadConfigFromFile} from 'vite';

// Regression (FW-ENGINE-STOP): the client dev host is rooted at the repository. Without explicit entries,
// Vite's dependency scan crawls every *.html, including the full studio index.html (SQL workbench) and
// dist-clients/*, and pre-bundles ~20 s of unrelated dependencies on a loaded Windows host. Vite's close()
// awaits that in-flight esbuild run, so a stopped host outlived its owner's 8 s budget.
test('client dev host scans only the selected client entry for dependency pre-bundling',async()=>{
  const previous=process.env.STUDIO_CLIENT;process.env.STUDIO_CLIENT='foundation-reference';
  try{
    const loaded=await loadConfigFromFile({command:'serve',mode:'development'},'vite.client.config.ts',process.cwd(),'silent');
    const entries=loaded?.config.optimizeDeps?.entries;
    assert.deepEqual(entries,['src/client-main.tsx'],'optimizeDeps.entries must name the client entry, never the default HTML crawl');
    for(const entry of entries)assert.ok(existsSync(entry),'Missing scan entry '+entry);
    // The served index.html is rewritten to this same entry; keep both in step.
    assert.ok((await readFile('vite.client.config.ts','utf8')).includes("replace('/src/main.tsx','/src/client-main.tsx')"));
  }finally{if(previous===undefined)delete process.env.STUDIO_CLIENT;else process.env.STUDIO_CLIENT=previous;}
});
