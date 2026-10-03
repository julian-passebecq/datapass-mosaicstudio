import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

/** Sum of separately gzipped emitted JS chunks, NOT initial transfer, CWV or runtime latency. */
export const clientBudgets = Object.freeze({
  'operations-reference': [164593, 210 * 1024],
  'wind-reference': [300869, 370 * 1024],
  'architecture-reference': [179398, 225 * 1024],
  'experience-reference': [412265, 500 * 1024],
  'energy-replay-reference': [302703, 375 * 1024],
  'motion-reference': [143839, 180 * 1024],
  'foundation-reference': [179739, 225 * 1024],
  'model-reference': [332948, 410 * 1024],
  'acceptance-fresh': [98929, 125 * 1024],
  'acceptance-knowledge': [165415, 210 * 1024],
  'acceptance-spatial': [296739, 365 * 1024],
  'acceptance-analytics': [163587, 205 * 1024],
  'acceptance-replay': [169898, 215 * 1024],
  'acceptance-motion': [141665, 175 * 1024],
  'acceptance-foundation': [171742, 215 * 1024],
  'acceptance-model': [266710, 330 * 1024],
});
export function assessClientBudgets(report) {
  if (!report || report.sourceUnchanged !== true || !Array.isArray(report.clients) || report.clients.length !== Object.keys(clientBudgets).length) throw new Error('Incomplete or source-mutating client acceptance report');
  const seen = new Set(), clients = report.clients.map(client => {
    if (!client || typeof client.id !== 'string' || !Object.hasOwn(clientBudgets, client.id) || seen.has(client.id)) throw new Error('Unknown or duplicate performance target');
    seen.add(client.id);
    if (client.status !== 'passed' || !Number.isSafeInteger(client.javascriptGzipBytes) || client.javascriptGzipBytes <= 0 || !Number.isSafeInteger(client.javascriptFiles) || client.javascriptFiles <= 0) throw new Error('Missing successful measured JavaScript evidence: ' + client.id);
    const [baselineBytes, budgetBytes] = clientBudgets[client.id];
    if (client.javascriptGzipBytes > budgetBytes) throw new Error(`Emitted JS budget exceeded: ${client.id} ${client.javascriptGzipBytes} > ${budgetBytes}`);
    return {id: client.id, javascriptGzipBytes: client.javascriptGzipBytes, baselineBytes, budgetBytes, deltaBytes: client.javascriptGzipBytes - baselineBytes, status: 'passed'};
  });
  return {format: 'datapass.client-performance', version: 1, metric: 'sum_of_individually_gzipped_emitted_javascript_bytes', baseline: {source: '98df6afce557947716d07661d1f884890c31c772', workflowRun: 37128396156, evidenceArtifactSha256: '1ff258d30fcd72baa660c110b9c2bc49a954e7da42f689c0af8f1e3ecd499d3b'}, limitation: 'Not an initial-load, Core Web Vitals, frame-rate, accessibility or production-asset certification.', sourceUnchanged: true, clients};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assessClientBudgets(JSON.parse(await readFile('qa/client-builds/results.json', 'utf8')));
  await mkdir('qa', {recursive: true}); await writeFile('qa/client-performance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`All ${report.clients.length} selected-client emitted-JavaScript budgets passed.`);
}
