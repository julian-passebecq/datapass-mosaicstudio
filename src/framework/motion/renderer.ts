import {select, easeCubicInOut, easeLinear} from 'd3';
import {interpolateFrame, motionFrame, settledDisplay, type CompiledMotion, type MotionDisplay, type MotionFrame} from './compile';
import {drawing, motionBounds, boundsText, pathData, polygonData, shade, statusColor, type MotionObject, type AnnotationDrawing} from './geometry';
import type {MotionProjection} from './model';

/** `speed` (default 1) divides transition durations; pass the controller's playback rate. */
export type MotionView = {index: number; selection: string; projection: MotionProjection; advance: boolean; reduced: boolean; speed?: number};
export type MotionRenderer = {update(view: MotionView): void; settle(): void; dispose(): void};

/** A finite D3 transition, not a playback clock. Keeps entity DOM identities across projections. */
export function createMotionRenderer(svg: SVGSVGElement, compiled: CompiledMotion, onSelect: (id: string) => void): MotionRenderer {
  const root = select(svg), uid = 'motion-arrow-' + (++sequence);
  const sizes={diagram:motionBounds(compiled,'diagram'),isometric:motionBounds(compiled,'isometric')};
  root.attr('tabindex', -1).attr('role', 'group').attr('aria-label', compiled.spec.title);
  root.append('title').text(compiled.spec.title);
  root.append('desc').text('Authored motion scene. The adjacent object list and transcript expose the same information without animation.');
  root.append('defs').append('marker').attr('id', uid).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto-start-reverse').append('path').attr('d', 'M0 0 L10 5 L0 10z').attr('fill', '#578ba4');
  const connections = root.append('g').attr('class', 'motion-links');
  const objects = root.append('g').attr('class', 'motion-objects');
  const notes = root.append('g').attr('class', 'motion-annotations').attr('pointer-events', 'none');
  let alive = true, animating = false, target: MotionFrame | null = null, display: MotionDisplay = {};
  let projection: MotionProjection = 'diagram', selection = 'none';
  function draw() {
    if (!alive || !target) return;
    const scene = drawing(compiled, target, projection, display);
    root.attr('viewBox', boundsText(sizes[projection])).attr('data-projection', projection).attr('data-step', target.id).attr('data-selection', selection);
    connections.selectAll<SVGPathElement, (typeof scene.links)[number]>('path').data(scene.links, d => d.id).join('path')
      .attr('d', d => pathData(d.path)).attr('fill', 'none').attr('stroke', d => d.active ? '#3284a4' : '#b4c5d0').attr('stroke-width', d => d.active ? 2.5 : 1.4).attr('marker-end', `url(#${uid})`).attr('data-link', d => d.id);
    const nodes = objects.selectAll<SVGGElement, MotionObject>('g.motion-object').data(scene.objects, d => d.id).join(enter => {
      const node = enter.append('g').attr('class', 'motion-object').attr('role', 'button').attr('tabindex', 0);
      node.append('title'); node.append('g').attr('class', 'motion-faces'); node.append('path').attr('class', 'motion-label-leader'); node.append('circle').attr('class', 'motion-status'); node.append('g').attr('class', 'motion-label');
      return node;
    });
    nodes.order().attr('data-entity', d => d.id).attr('data-world', d => display[d.id].position.map(n => n.toFixed(4)).join(','))
      .attr('opacity', d => d.alpha).attr('aria-label', d => 'Select ' + d.label).attr('aria-pressed', d => String(d.id === selection))
      .attr('aria-hidden', d => d.alpha === 0 ? 'true' : null).attr('tabindex', d => d.alpha === 0 ? -1 : 0).attr('pointer-events', d => d.alpha === 0 ? 'none' : 'auto')
      .on('click.motion', (_, d) => onSelect(d.id)).on('keydown.motion', (event: KeyboardEvent, d) => {
        if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); onSelect(d.id);}
      });
    nodes.each(function(object) {
      const node = select(this); node.select('title').text(object.label + ' / ' + object.status);
      if (object.alpha === 0 && document.activeElement === this) svg.focus({preventScroll: true});
      node.select('.motion-faces').selectAll<SVGPolygonElement, number[][]>('polygon').data(object.faces).join('polygon')
        .attr('points', face => polygonData(face as [number, number][]))
        .attr('fill', (_, i) => shade(object.color, i === 0 && projection === 'isometric' ? -.24 : i === 1 ? -.12 : .6))
        .attr('stroke', object.id === selection ? '#124b6c' : shade(object.color, -.2)).attr('stroke-width', object.id === selection ? 2.6 : 1.2)
        .attr('stroke-linejoin', 'round');
      node.select('.motion-label-leader').attr('d', pathData(object.leader)).attr('fill', 'none').attr('stroke', '#93a8b8').attr('stroke-width', .8).attr('stroke-dasharray', '2 3').attr('pointer-events', 'none');
      node.select('.motion-status').attr('cx', object.center[0]).attr('cy', Math.min(...object.faces.flat().map(p => p[1])) - 9).attr('r', object.kind === 'station' ? 3 : 0).attr('fill', statusColor(object.status));
      node.select('.motion-label').selectAll<SVGTextElement, string>('text').data(object.labelLines).join('text').text(d => d)
        .attr('x', object.labelPosition[0]).attr('y', (_, i) => object.labelPosition[1] + i * 15).attr('text-anchor', 'middle')
        .attr('fill', '#21384a').attr('font-family', 'system-ui,sans-serif').attr('font-size', object.kind === 'station' ? 12 : 10);
    });
    const callouts = notes.selectAll<SVGGElement, AnnotationDrawing>('g.motion-annotation').data(scene.annotations, d => d.id).join(enter => {
      const node = enter.append('g').attr('class', 'motion-annotation').attr('role', 'note');
      node.append('title'); node.append('path'); node.append('rect'); node.append('g').attr('class', 'motion-annotation-text'); return node;
    });
    callouts.attr('data-annotation', d => d.id).attr('data-anchor', d => d.entity).attr('opacity', d => d.alpha)
      .attr('aria-hidden', d => d.alpha === 0 ? 'true' : null).attr('aria-label', d => d.text);
    callouts.each(function(a) {
      const node = select(this), {x, y, width, height} = a.box;
      node.select('title').text(a.text);
      node.select('path').attr('d', pathData([a.anchor, [x + width / 2, y + height]])).attr('fill', 'none').attr('stroke', '#657f90').attr('stroke-width', 1).attr('stroke-dasharray', '3 3');
      node.select('rect').attr('x', x).attr('y', y).attr('width', width).attr('height', height).attr('rx', 5).attr('fill', '#ffffff').attr('stroke', '#819aaa');
      node.select('.motion-annotation-text').selectAll<SVGTextElement, string>('text').data(a.lines).join('text').text(d => d)
        .attr('x', x + 11).attr('y', (_, i) => y + 21 + i * 15).attr('fill', '#21384a').attr('font-family', 'system-ui,sans-serif').attr('font-size', 11);
    });
  }
  function settle() {
    if (!alive) return;
    root.interrupt('motion'); animating = false;
    if (target) {display = settledDisplay(target); draw();}
    root.attr('data-animating', 'false');
  }
  return {
    update(view) {
      if (!alive) return;
      const next = motionFrame(compiled, view.index), previous = target;
      const same = previous?.index === next.index && projection === view.projection;
      selection = view.selection;
      // Updating the inspector must not cancel or restart the current token transfer.
      if (same) {if (view.reduced && animating) settle(); else draw(); return;}
      const animate = !!previous && !animating && view.advance && next.index === previous.index + 1 && !view.reduced && projection === view.projection;
      root.interrupt('motion'); projection = view.projection; target = next;
      if (!animate || !compiled.spec.steps[next.index].transitionMs) {settle(); return;}
      animating = true; root.attr('data-animating', 'true'); display = settledDisplay(previous!); draw();
      root.transition('motion').duration(compiled.spec.steps[next.index].transitionMs / (view.speed && Number.isFinite(view.speed) && view.speed > 0 ? view.speed : 1)).ease(compiled.spec.version === 2 ? easeLinear : easeCubicInOut)
        .tween('scene', () => fraction => {display = interpolateFrame(previous!, next, fraction); draw();})
        .on('end.motion', () => {animating = false; display = settledDisplay(next); draw(); root.attr('data-animating', 'false');});
    },
    settle,
    dispose() {if (!alive) return; alive = false; root.interrupt('motion'); root.selectAll('*').remove();},
  };
}
let sequence = 0;
