/**
 * Single source of the workbench's security headers, used by `vite preview` (vite.config.ts) and by the
 * static-host `public/_headers` file (scripts/prepare-assets.mjs), so both serve the same policy.
 *
 * connect-src allows loopback http and ws (any port) because the workbench talks to a runtime the visitor runs
 * on their own machine: the Python runtime (py/service) and a paired Jupyter Server. That connection is gated
 * elsewhere, not by CSP: the browser loader accepts only loopback or same-origin service URLs after an explicit
 * consent, every runtime route needs the per-start token, and the service binds 127.0.0.1, checks the Host
 * header and answers only allowlisted Origins. Loopback is not a network origin, so the CSP still blocks any
 * remote connection. Selected client builds keep their own stricter policy (scripts/client-csp.mjs).
 */
export const WORKBENCH_CSP=["default-src 'self'","script-src 'self' 'wasm-unsafe-eval'","worker-src 'self' blob:",
  "connect-src 'self' blob: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  "style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:","object-src 'none'","base-uri 'self'"].join('; ');

export const WORKBENCH_HEADERS={'Content-Security-Policy':WORKBENCH_CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};

/** Netlify/Cloudflare Pages `_headers` syntax: one path rule, two-space indented `Name: value` lines. */
export const workbenchHeadersFile=()=>'/*\n'+Object.entries(WORKBENCH_HEADERS).map(([k,v])=>`  ${k}: ${v}\n`).join('');

/** Parses a `_headers` file into {path: {name: value}} (enough for the sync test and the static check server). */
export function parseHeadersFile(text){
  const rules={};let current=null;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    if(!/^\s/.test(line)){current=rules[line.trim()]={};continue;}
    const i=line.indexOf(':');if(!current||i<0)throw new Error('Malformed _headers line: '+line);
    current[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  return rules;
}
