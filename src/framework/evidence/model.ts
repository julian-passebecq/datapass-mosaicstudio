import {identifier, strict, text} from '../guards.ts';
import {safeRelativePath} from '../../core/host.ts';

/** Public, inert excerpts supplied by a client. Not a live repository or execution trace. */
export type SourceArtifact = {
  id: string;
  path: string;
  language: 'python' | 'sql' | 'typescript' | 'json' | 'markdown' | 'text';
  title: string;
  text: string;
  provenance: 'synthetic' | 'provided';
};
export type EvidenceRef = {artifact: string; start: number; end: number; label: string};
export const EVIDENCE_LIMITS = Object.freeze({files: 24, lines: 2000, fileBytes: 64000, totalBytes: 256000});
export const sourceLines = (artifact: SourceArtifact): string[] => artifact.text.split(/\r?\n/);

export function validateSources(input: unknown): SourceArtifact[] {
  if (!Array.isArray(input) || input.length > EVIDENCE_LIMITS.files) throw new Error('Source file limit');
  const ids = new Set<string>(), paths = new Set<string>();
  let bytes = 0;
  for (const artifact of input) {
    strict(artifact, ['id', 'path', 'language', 'title', 'text', 'provenance'], 'source artifact');
    identifier(artifact.id, 'artifact.id');
    if (artifact.id === 'none' || ids.has(artifact.id)) throw new Error('Reserved or duplicate source id');
    ids.add(artifact.id);
    if (typeof artifact.path !== 'string' || !safeRelativePath(artifact.path) || /[\u0000-\u001f\u007f]/.test(artifact.path)) throw new Error('Source path must be a safe relative path');
    if (paths.has(artifact.path)) throw new Error('Duplicate source path');
    paths.add(artifact.path);
    if (typeof artifact.language !== 'string' || !['python', 'sql', 'typescript', 'json', 'markdown', 'text'].includes(artifact.language)) throw new Error('Unsupported source language');
    if (artifact.provenance !== 'synthetic' && artifact.provenance !== 'provided') throw new Error('Unknown source provenance');
    text(artifact.title, 'source.title', 160);
    text(artifact.text, 'source.text', EVIDENCE_LIMITS.fileBytes, false);
    if (artifact.text.includes('\0')) throw new Error('NUL is not supported in source text');
    const size = new TextEncoder().encode(artifact.text).byteLength;
    bytes += size;
    if (size > EVIDENCE_LIMITS.fileBytes || bytes > EVIDENCE_LIMITS.totalBytes || sourceLines(artifact as SourceArtifact).length > EVIDENCE_LIMITS.lines) throw new Error('Source content budget exceeded');
  }
  return structuredClone(input) as SourceArtifact[];
}

export function validateEvidence(input: unknown, sources: readonly SourceArtifact[]): EvidenceRef[] {
  if (!Array.isArray(input) || input.length > 8) throw new Error('Evidence reference limit');
  const ids = new Set<string>();
  for (const ref of input) {
    strict(ref, ['artifact', 'start', 'end', 'label'], 'evidence reference');
    identifier(ref.artifact, 'evidence artifact');
    const artifact = sources.find(s => s.id === ref.artifact);
    if (!artifact) throw new Error('Unknown evidence artifact');
    if (typeof ref.start !== 'number' || typeof ref.end !== 'number' || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || ref.start < 1 || ref.end < ref.start || ref.end > sourceLines(artifact).length) throw new Error('Evidence line range is outside the source');
    text(ref.label, 'evidence label', 160);
    const key = `${ref.artifact}:${ref.start}:${ref.end}`;
    if (ids.has(key)) throw new Error('Duplicate evidence range');
    ids.add(key);
  }
  return structuredClone(input) as EvidenceRef[];
}

export function excerpt(sources: readonly SourceArtifact[], ref: EvidenceRef): string {
  validateEvidence([ref], sources);
  return sourceLines(sources.find(s => s.id === ref.artifact)!).slice(ref.start - 1, ref.end).join('\n');
}
