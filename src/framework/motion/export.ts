import {motionStepEvidence} from './model.ts';
import {motionFrame, type CompiledMotion} from './compile.ts';
import {drawing, motionBounds, boundsText, pathData, roundedPathData, polygonData, shade, statusColor, objectPoints, type MotionDrawing} from './geometry.ts';
import type {GlyphShape} from './glyphs.ts';
import type {MotionProjection} from './model.ts';
import {excerpt} from '../evidence/model.ts';

export const escapeMarkup = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
/** Same canonical geometry as the live renderer. Exports the target snapshot, never a half-transition. */
const r3 = (v: number) => v.toFixed(3);
/** Projected glyph shapes as SVG. Colours come from validated hex values and the code-owned registry. */
export function glyphMarkup(shapes: readonly GlyphShape[], selected = false): string {
  return shapes.map(s => s.kind === 'polygon'
    ? `<polygon points="${polygonData(s.points)}" fill="${s.fill}"${s.opacity < 1 ? ` fill-opacity="${s.opacity}"` : ''} stroke="${selected ? '#124b6c' : s.stroke}" stroke-width="${selected ? 1.6 : s.width}" stroke-linejoin="round"/>`
    : s.kind === 'polyline'
      ? `<path d="${pathData(s.points)}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}"${s.opacity < 1 ? ` stroke-opacity="${s.opacity}"` : ''}${s.dash ? ' stroke-dasharray="3 3"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="${r3(s.center[0])}" cy="${r3(s.center[1])}" r="${r3(s.r)}" fill="${s.fill}" stroke="${selected ? '#124b6c' : s.stroke}" stroke-width="${s.width}"/>`).join('');
}
type Plane = NonNullable<MotionDrawing['planes']>[number];
type Group = NonNullable<MotionDrawing['groups']>[number];
const planeMarkup = (p: Plane) => `<g data-layer="${escapeMarkup(p.id)}"><polygon points="${polygonData(p.polygon)}" fill="${p.color}" fill-opacity="${p.texture === 'water' ? .55 : .16}" stroke="${p.color}" stroke-opacity=".7"/>${p.texture === 'water' ? `<polygon points="${polygonData(p.polygon)}" fill="url(#motion-water)"/>` : ''}<text x="${r3(p.labelPosition[0])}" y="${r3(p.labelPosition[1])}" text-anchor="end" font-size="12.5" font-weight="600" fill="#21384a" font-family="system-ui,sans-serif">${escapeMarkup(p.label)}</text></g>`;
const groupOutline = (g: Group) => `<g data-group="${escapeMarkup(g.id)}" data-layer-of="${escapeMarkup(g.layer)}"><polygon points="${polygonData(g.polygon)}" fill="${g.color}" fill-opacity=".12" stroke="${shade(g.color, -.25)}" stroke-width="1.1" stroke-dasharray="6 4" stroke-linejoin="round"/></g>`;
const groupLabel = (g: Group, background: string) => g.label ? `<text data-group-label="${escapeMarkup(g.id)}" x="${r3(g.labelPosition[0])}" y="${r3(g.labelPosition[1])}" font-size="9.5" font-weight="650" letter-spacing="1.1" fill="${shade(g.color, -.6)}" stroke="${background}" stroke-width="3" paint-order="stroke" font-family="system-ui,sans-serif">${escapeMarkup(g.label.toUpperCase())}</text>` : '';
/** Layer planes then domain outlines and labels, flat (the live renderer draws them under everything). */
export function groundMarkup(scene: MotionDrawing, background: string): string {
  return (scene.planes || []).map(planeMarkup).join('') + (scene.groups || []).map(g => groupOutline(g) + groupLabel(g, background)).join('');
}
/**
 * Exported layered scenes are painted stratum by stratum, bottom to top: plane, domain outlines, the links
 * leaving that plane, its stations, then domain labels. Higher planes therefore veil what lies below them.
 */
function stratified(scene: MotionDrawing, background: string, objects: {layer: number; markup: string}[], links: {layer: number; markup: string}[]): string {
  return scene.planes!.map((plane, i) => {
    const groups = (scene.groups || []).filter(g => g.layer === plane.id);
    return planeMarkup(plane) + groups.map(groupOutline).join('') + links.filter(l => l.layer === i).map(l => l.markup).join('')
      + objects.filter(o => o.layer === i).map(o => o.markup).join('') + groups.map(g => groupLabel(g, background)).join('');
  }).join('');
}
export function motionSvg(compiled: CompiledMotion, index: number, mode: MotionProjection, selection = 'none'): string {
  const frame = motionFrame(compiled, index), scene = drawing(compiled, frame, mode), b = motionBounds(compiled, mode);
  const options = compiled.spec.scene || {}, paper = options.background ?? '#f7fafc', attached = options.labels === 'attached';
  const halo = attached ? ` stroke="${paper}" stroke-width="3" paint-order="stroke"` : '';
  const objectList = scene.objects.filter(o => o.alpha > 0).map(o => `<g data-entity="${escapeMarkup(o.id)}"${o.glyphName ? ` data-glyph="${escapeMarkup(o.glyphName)}"${o.glyphFallback ? ' data-glyph-fallback="box"' : ''}` : ''}><title>${escapeMarkup(o.label)}</title>${o.glyph ? glyphMarkup(o.glyph, o.id === selection) : o.faces.map((face, i) => `<polygon points="${polygonData(face)}" fill="${shade(o.color, i === 0 && mode === 'isometric' ? -.24 : i === 1 ? -.12 : .6)}" stroke="${o.id === selection ? '#124b6c' : shade(o.color, -.2)}" stroke-width="${o.id === selection ? 2.6 : 1.2}"/>`).join('')}<path d="${pathData(o.leader)}" fill="none" stroke="#93a8b8" stroke-width=".8" stroke-dasharray="2 3"/>${o.glyph && o.status === 'idle' ? '' : `<circle cx="${o.center[0]}" cy="${Math.min(...objectPoints(o).map(p => p[1])) - 9}" r="${o.kind === 'station' ? 3 : 0}" fill="${statusColor(o.status)}"/>`}${o.labelLines.map((line, i) => `<text x="${o.labelPosition[0]}" y="${o.labelPosition[1] + i * 15}" text-anchor="middle" font-size="${o.kind === 'station' ? 12 : 10}" fill="#21384a" font-family="system-ui,sans-serif"${halo}>${escapeMarkup(line)}</text>`).join('')}</g>`);
  const objects = objectList.join('');
  const annotations = scene.annotations.filter(a => a.alpha > 0).map(a => {
    const {x, y, width, height} = a.box;
    return `<g data-annotation="${escapeMarkup(a.id)}" data-anchor="${escapeMarkup(a.entity)}"><title>${escapeMarkup(a.text)}</title><path d="${pathData([a.anchor, [x + width / 2, y + height]])}" fill="none" stroke="#657f90" stroke-dasharray="3 3"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="#ffffff" stroke="#819aaa"/>${a.lines.map((line, i) => `<text x="${x + 11}" y="${y + 21 + i * 15}" font-family="system-ui,sans-serif" font-size="11" fill="#21384a">${escapeMarkup(line)}</text>`).join('')}</g>`;
  }).join('');
  const dashed = scene.links.some(l => l.style === 'dashed'), water = (scene.planes || []).some(p => p.texture === 'water');
  const linkPath = (points: MotionDrawing['links'][number]['path']) => options.linkCorner ? roundedPathData(points, options.linkCorner) : pathData(points);
  const linkList = scene.links.map(link => {
    const d = linkPath(link.path), casing = options.linkCasing ? `<path d="${d}" fill="none" stroke="${paper}" stroke-width="${link.active ? 6 : 5}" stroke-linejoin="round"/>` : '';
    if (link.style === 'dashed') return `<g data-link="${escapeMarkup(link.id)}" data-style="dashed">${casing}<path d="${d}" fill="none" stroke="${link.active ? '#a0835a' : '#cdb89a'}" stroke-width="${link.active ? 1.8 : 1.3}" stroke-dasharray="5 4" marker-end="url(#motion-arrow-dashed)"/></g>`;
    const line = `<path d="${d}" fill="none" stroke="${link.active ? '#3284a4' : '#b4c5d0'}" stroke-width="${link.active ? 2.5 : 1.4}" marker-end="url(#motion-arrow)"/>`;
    return casing || link.style ? `<g data-link="${escapeMarkup(link.id)}">${casing}${line}</g>` : line;
  });
  const visible = scene.objects.filter(o => o.alpha > 0);
  const body = scene.planes
    ? stratified(scene, paper, visible.map((o, i) => ({layer: o.layer ?? 0, markup: objectList[i]})), scene.links.map((l, i) => ({layer: l.layer ?? 0, markup: linkList[i]})))
    : linkList.join('') + objects;
  const header = options.header ? `<text x="${r3(b.x + 24)}" y="${r3(b.y + 34)}" font-size="20" font-weight="650" fill="#21384a" font-family="system-ui,sans-serif">${escapeMarkup(compiled.spec.title)}</text><text x="${r3(b.x + 24)}" y="${r3(b.y + 54)}" font-size="11.5" fill="#647889" font-family="system-ui,sans-serif">${escapeMarkup(compiled.spec.description.length > 150 ? compiled.spec.description.slice(0, 149) + '…' : compiled.spec.description)}</text>` : '';
  const ly = b.y + b.height + 13, lx = b.x + b.width - 330;
  const legend = options.legend ? `<g data-legend=""><path d="M${r3(lx)} ${r3(ly)} h30" stroke="#3284a4" stroke-width="2.2" marker-end="url(#motion-arrow)"/><text x="${r3(lx + 38)}" y="${r3(ly + 4)}" font-size="10.5" fill="#647889" font-family="system-ui,sans-serif">${escapeMarkup(options.legend.solid)}</text><path d="M${r3(lx + 165)} ${r3(ly)} h30" stroke="#a0835a" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#motion-arrow-dashed)"/><text x="${r3(lx + 203)}" y="${r3(ly + 4)}" font-size="10.5" fill="#647889" font-family="system-ui,sans-serif">${escapeMarkup(options.legend.dashed)}</text></g>` : '';
  const defs = `<marker id="motion-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#578ba4"/></marker>`
    + (dashed || options.legend ? `<marker id="motion-arrow-dashed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#a0835a"/></marker>` : '')
    + (water ? `<pattern id="motion-water" width="36" height="12" patternUnits="userSpaceOnUse"><path d="M0 8 Q9 3 18 8 T36 8" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.2"/></pattern>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${boundsText({...b, height: b.height + 36})}" role="img"><title>${escapeMarkup(compiled.spec.title)} / ${escapeMarkup(compiled.spec.steps[index].title)}</title><desc>${compiled.spec.provenance === 'recorded' ? 'Snapshot of a recorded trace; layout and timing are presentation.' : 'Authored ' + escapeMarkup(compiled.spec.provenance) + ' snapshot, not an execution trace.'} ${escapeMarkup(compiled.spec.steps[index].caption)}</desc><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height + 36}" fill="${paper}"/><defs>${defs}</defs>${header}${body}${annotations}<text x="${b.x + 16}" y="${b.y + b.height + 17}" font-size="10" font-family="system-ui,sans-serif" fill="#647889">${escapeMarkup(compiled.spec.provenance.toUpperCase())} / ${index + 1} of ${compiled.frames.length} / ${escapeMarkup(mode)} / target snapshot</text>${legend}</svg>`;
}
export function motionReport(compiled: CompiledMotion, index: number, mode: MotionProjection, includeSource = false): string {
  if (typeof includeSource !== 'boolean') throw new Error('Source export requires an explicit boolean');
  const spec = compiled.spec;
  const steps = spec.steps.map(step => `<li><h2>${escapeMarkup(step.title)}</h2><p>${escapeMarkup(step.caption)}</p>${(step.annotations || []).map(a => `<p><strong>${escapeMarkup(spec.entities.find(e => e.id === a.entity)!.label)}:</strong> ${escapeMarkup(a.text)}</p>`).join('')}${includeSource ? motionStepEvidence(step).map(ref => `<details><summary>${escapeMarkup(ref.label)} / ${escapeMarkup(spec.sources.find(s => s.id === ref.artifact)!.path)}:${ref.start}-${ref.end}</summary><pre>${escapeMarkup(excerpt(spec.sources, ref))}</pre></details>`).join('') : ''}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escapeMarkup(spec.title)}</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#21384a;max-width:1040px;margin:40px auto;padding:0 24px}h1{font-size:32px;line-height:1.2}h2{font-size:19px}svg{width:100%;height:auto;border:1px solid #d7e2ea;border-radius:8px}li{padding:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f7fa;padding:15px}small,footer{color:#617487}summary{cursor:pointer}footer{border-top:1px solid #d7e2ea;padding-top:16px}</style></head><body><small>${escapeMarkup(spec.provenance)} / ${spec.provenance === 'recorded' ? 'recorded trace, authored presentation' : 'authored explanation'}</small><h1>${escapeMarkup(spec.title)}</h1><p>${escapeMarkup(spec.description)}</p>${motionSvg(compiled, index, mode)}<p>${escapeMarkup(spec.note)}</p><ol>${steps}</ol><footer>Source excerpts ${includeSource ? 'included by explicit choice' : 'omitted'}. Labels, narrative and visible relationships are included; review before sharing. This report does not prove code execution or model correctness.</footer></body></html>`;
}
