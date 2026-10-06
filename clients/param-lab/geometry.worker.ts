/// <reference lib="webworker" />
/** Rebuild worker. The worker file itself is the lazy boundary (it is created by the
 * component, never part of the main bundle); it instantiates the manifold-3d WebAssembly kernel on the first
 * request (never in the main bundle), then answers one build per message.
 * Stale results are dropped by the caller via the sequence number.
 */
// Relative path on purpose: a bare 'manifold-3d' import discovered only inside a worker
// stalls Vite's dev dependency optimizer (request never answers). Served as-is instead.
import Module from '../../node_modules/manifold-3d/manifold.js';
import wasmUrl from '../../node_modules/manifold-3d/manifold.wasm?url';
import {buildModel,type ManifoldKernel} from './geometry.ts';

type Request = {type: 'build'; seq: number; params: Record<string, number>};
let kernel: Promise<{kernel: ManifoldKernel | null; reason: string}> | null = null;

function loadKernel() {
  return kernel ??= (async () => {
    try {
      const wasm = await Module({locateFile: () => wasmUrl});
      wasm.setup();
      return {kernel: wasm as unknown as ManifoldKernel, reason: ''};
    } catch (error) {
      // Typical cause: a Content-Security-Policy without 'wasm-unsafe-eval'.
      const message = error instanceof Error ? error.message : String(error);
      return {kernel: null, reason: /CSP|Content Security|unsafe-eval|CompileError/i.test(message) ? 'this page\'s Content-Security-Policy blocks WebAssembly.' : 'the WebAssembly kernel failed to load (' + message.slice(0, 120) + ').'};
    }
  })();
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const {seq, params} = event.data;
  try {
    const {kernel: k, reason} = await loadKernel();
    const result = await buildModel(params, k, reason);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({type: 'result', seq, result}, [result.positions.buffer, result.normals.buffer, result.faceCodes.buffer]);
  } catch (error) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({type: 'error', seq, message: error instanceof Error ? error.message : String(error)});
  }
};
