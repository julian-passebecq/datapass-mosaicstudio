/** Shared inert-data guards. No browser, renderer or runtime dependency. */
export function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
export function strict(v: unknown, keys: readonly string[], label: string): asserts v is Record<string, unknown> {
  if (!object(v) || Object.keys(v).some(k => !keys.includes(k))) throw new Error(label + ': unexpected fields or non-object');
}
export function text(v: unknown, label: string, max = 2000, required = true): asserts v is string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error(label + ': invalid text');
}
export function identifier(v: unknown, label: string): asserts v is string {
  if (typeof v !== 'string' || !/^[a-z][a-zA-Z0-9_-]{0,79}$/.test(v) || ['constructor','prototype','__proto__'].includes(v)) throw new Error(label + ': invalid id');
}
