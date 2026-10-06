/** Pure query helpers. Identifiers and values are quoted separately. */
export function identifier(name: string): string {
  if (typeof name !== 'string' || !name.length || name.length > 200 || /\0/.test(name)) throw new Error('Invalid identifier');
  return '"' + name.replaceAll('"', '""') + '"';
}
export function literal(value: string): string {
  if (typeof value !== 'string' || value.length > 10000 || /\0/.test(value)) throw new Error('Invalid literal');
  return "'" + value.replaceAll("'", "''") + "'";
}
export function pageQuery(table: string, offset = 0, size = 100): string {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1 || size > 500) throw new Error('Invalid page bounds');
  return `SELECT * FROM ${identifier(table)} LIMIT ${size} OFFSET ${offset}`;
}
export function tableId(name: string, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid import sequence');
  return 'data_' + sequence + '_' + (name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60) || 'file');
}
export function displayValue(value: unknown): string {
  if (value == null) return '\u2014';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') { try { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v); } catch { return String(value); } }
  return String(value);
}
/** Prevent spreadsheet formulas in generated CSV. Data in the UI is not modified. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : displayValue(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.map(csvCell).join(','), ...rows.map(row => columns.map(c => csvCell(row[c])).join(','))].join('\r\n');
}
/** A transport-neutral latest-result guard. It does NOT cancel work in DuckDB. */
export class RevisionGate {
  #revision = 0;
  next(): number { return ++this.#revision; }
  current(revision: number): boolean { return revision === this.#revision; }
  invalidate(): void { this.#revision++; }
}
