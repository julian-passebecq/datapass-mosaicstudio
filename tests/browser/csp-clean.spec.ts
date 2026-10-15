import {test,expect} from '@playwright/test';
import {WORKBENCH_CSP} from '../../scripts/workbench-headers.mjs';

// vite preview serves the same policy as the shipped _headers (scripts/workbench-headers.mjs). Opening the workbench
// and the artifact viewer under it must raise no CSP violation: REL-0.11.1 JOURNEY-01 found zod 4's caught
// `new Function` probe reported as script-src 'eval' violations until main.tsx set zod jitless.
for(const url of ['/?workspace=blank','/?artifact=1']){
  test(`no CSP violation under the shipped policy: ${url}`,async({page})=>{
    const violations:string[]=[];
    await page.exposeFunction('__cspViolation',(v:string)=>violations.push(v));
    await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>(window as unknown as {__cspViolation:(v:string)=>void}).__cspViolation(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
    page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))violations.push('console: '+m.text().slice(0,300));});
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});
    expect(response!.headers()['content-security-policy']).toBe(WORKBENCH_CSP);
    if(url.includes('workspace'))await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
    else await expect(page.getByTestId('artifact-empty')).toBeVisible();
    await page.waitForTimeout(500);
    expect(violations).toEqual([]);
  });
}
