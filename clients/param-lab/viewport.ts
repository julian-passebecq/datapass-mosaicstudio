/** Client-owned Three.js viewport for the param lab. Render on demand only:
 * no idle animation loop. Geometry comes from the worker; selection, hover,
 * camera and overlays are view state and never trigger a rebuild.
 */
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {featureIdForCode} from './features.ts';
import type {BuildResult} from './geometry.ts';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top';
export type Pick = {featureId: string; point: [number, number, number]};

const BASE: Record<string, THREE.Color> = {hub: new THREE.Color('#8f9ca6'), upper: new THREE.Color('#d5dee5'), lower: new THREE.Color('#aebcc7'), cap: new THREE.Color('#9fb0bc')};
const SELECT = new THREE.Color('#e0701f'), HOVER = new THREE.Color('#f2b27c');

function baseColor(code: number) {
  if (code < 10) return BASE.hub;
  const slot = code % 10; return slot === 1 ? BASE.upper : slot === 2 ? BASE.lower : BASE.cap;
}

export class LabViewport {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private wire: THREE.LineSegments | null = null;
  private edges = new THREE.Group();
  private highlight = new THREE.Group();
  private result: BuildResult | null = null;
  private selected = 'none';
  private hovered = 'none';
  private showEdges = true;
  private showWire = false;
  private radius = 200;
  private center = new THREE.Vector3();
  private frame = 0;
  private raycaster = new THREE.Raycaster();
  onRender: (() => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D view. Click a face or an edge to select it; drag to orbit.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#f3f6f8');
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9aa8b3', 2.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-0.5, 0.6, 1); this.camera.add(key);
    const rim = new THREE.DirectionalLight('#dfe9f0', 0.8); rim.position.set(0.7, -0.4, -0.6); this.camera.add(rim);
    this.scene.add(this.camera, this.edges, this.highlight);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.requestRender());
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = width + 'px'; this.renderer.domElement.style.height = height + 'px';
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
    this.renderNow();
  }

  setResult(result: BuildResult, fit: boolean) {
    this.result = result;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    if (this.wire) { this.scene.remove(this.wire); this.wire.geometry.dispose(); (this.wire.material as THREE.Material).dispose(); this.wire = null; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(result.positions.length), 3));
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors: true, metalness: 0.15, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1}));
    this.scene.add(this.mesh);
    const b = result.metrics.bbox;
    this.center.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    this.radius = Math.max(1, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2);
    this.camera.near = this.radius / 50; this.camera.far = this.radius * 50; this.camera.updateProjectionMatrix();
    this.raycaster.params.Line = {threshold: this.radius * 0.012};
    this.rebuildEdges(); this.rebuildWire(); this.paint();
    if (fit) this.setCamera('iso'); else this.renderNow();
  }

  setCamera(preset: CameraPreset) {
    const d = this.radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.0;
    const dir = {iso: new THREE.Vector3(-1.1, -0.75, 0.6), front: new THREE.Vector3(-1, 0, 0.0001), side: new THREE.Vector3(0, -1, 0.0001), top: new THREE.Vector3(0.0001, 0, 1)}[preset].normalize();
    this.camera.position.copy(this.center).addScaledVector(dir, d);
    this.camera.up.set(preset === 'top' ? 1 : 0, 0, preset === 'top' ? 0 : 1);
    this.controls.target.copy(this.center); this.camera.lookAt(this.center); this.controls.update();
    this.renderNow();
  }

  setSelection(id: string) { if (id !== this.selected) { this.selected = id; this.paint(); this.rebuildHighlight(); this.requestRender(); } }
  setHover(id: string) { if (id !== this.hovered) { this.hovered = id; this.paint(); this.rebuildHighlight(); this.requestRender(); } }
  setOverlays(edges: boolean, wire: boolean) {
    if (edges === this.showEdges && wire === this.showWire) return;
    this.showEdges = edges; this.showWire = wire; this.edges.visible = edges; this.rebuildWire(); this.requestRender();
  }

  pick(clientX: number, clientY: number): Pick | null {
    if (!this.mesh || !this.result) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const face = this.raycaster.intersectObject(this.mesh, false)[0];
    // Edges win when they are not hidden behind the surface (small tolerance: edges lie ON the surface).
    const edge = this.raycaster.intersectObjects(this.edges.children, false).find(hit => !face || hit.distance <= face.distance + this.radius * 0.02);
    const hit = edge ?? face;
    if (!hit) return null;
    const featureId = edge ? String(edge.object.userData.featureId) : featureIdForCode(this.result.faceCodes[face!.faceIndex ?? -1] ?? 0);
    return featureId ? {featureId, point: [hit.point.x, hit.point.y, hit.point.z]} : null;
  }

  /** Project a feature's anchor to canvas pixels (used by tests and the label). */
  anchor(featureId: string): {x: number; y: number} | null {
    if (!this.result || !this.mesh) return null;
    const edge = this.result.edges.find(e => e.id === featureId);
    let p: THREE.Vector3 | null = null;
    if (edge) { const i = Math.floor(edge.points.length / 6) * 3; p = new THREE.Vector3(edge.points[i], edge.points[i + 1], edge.points[i + 2]); }
    else {
      const codes = this.result.faceCodes, pos = this.result.positions, camDir = this.camera.getWorldDirection(new THREE.Vector3());
      let best = -Infinity;
      for (let t = 0; t < codes.length; t++) {
        if (featureIdForCode(codes[t]) !== featureId) continue;
        const n = new THREE.Vector3(this.result.normals[9 * t], this.result.normals[9 * t + 1], this.result.normals[9 * t + 2]);
        const facing = -n.dot(camDir);
        if (facing > best) { best = facing; p = new THREE.Vector3((pos[9 * t] + pos[9 * t + 3] + pos[9 * t + 6]) / 3, (pos[9 * t + 1] + pos[9 * t + 4] + pos[9 * t + 7]) / 3, (pos[9 * t + 2] + pos[9 * t + 5] + pos[9 * t + 8]) / 3); }
      }
    }
    if (!p) return null;
    const v = p.project(this.camera), rect = this.renderer.domElement.getBoundingClientRect();
    return {x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height};
  }

  private paint() {
    if (!this.mesh || !this.result) return;
    const colors = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute, codes = this.result.faceCodes;
    for (let t = 0; t < codes.length; t++) {
      const id = featureIdForCode(codes[t]);
      const c = id === this.selected ? SELECT : id === this.hovered ? HOVER : baseColor(codes[t]);
      for (let i = 0; i < 3; i++) colors.setXYZ(3 * t + i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }

  private rebuildEdges() {
    for (const child of [...this.edges.children]) { this.edges.remove(child); const l = child as THREE.Line; l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
    for (const e of this.result?.edges ?? []) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(e.points, 3));
      const line = e.closed ? new THREE.LineLoop(g, new THREE.LineBasicMaterial({color: '#2b3a46'})) : new THREE.Line(g, new THREE.LineBasicMaterial({color: '#2b3a46'}));
      line.userData.featureId = e.id; this.edges.add(line);
    }
    this.edges.visible = this.showEdges;
    this.rebuildHighlight();
  }

  /** Selected / hovered edges are drawn as tubes: WebGL line width is always 1px. */
  private rebuildHighlight() {
    for (const child of [...this.highlight.children]) { this.highlight.remove(child); const m = child as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    for (const [id, color] of [[this.hovered, HOVER], [this.selected, SELECT]] as const) {
      const e = this.result?.edges.find(edge => edge.id === id);
      if (!e) continue;
      const pts: THREE.Vector3[] = []; for (let i = 0; i < e.points.length; i += 3) pts.push(new THREE.Vector3(e.points[i], e.points[i + 1], e.points[i + 2]));
      const path = new THREE.CurvePath<THREE.Vector3>(); for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      if (e.closed) path.add(new THREE.LineCurve3(pts[pts.length - 1], pts[0]));
      this.highlight.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, this.radius * 0.006, 6, e.closed), new THREE.MeshBasicMaterial({color})));
    }
  }

  private rebuildWire() {
    if (this.wire) { this.scene.remove(this.wire); this.wire.geometry.dispose(); (this.wire.material as THREE.Material).dispose(); this.wire = null; }
    if (!this.showWire || !this.mesh) return;
    this.wire = new THREE.LineSegments(new THREE.WireframeGeometry(this.mesh.geometry), new THREE.LineBasicMaterial({color: '#3c5566', transparent: true, opacity: 0.25}));
    this.scene.add(this.wire);
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.renderNow(); });
  }
  renderNow() { if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; } this.renderer.render(this.scene, this.camera); this.onRender?.(); }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.result = null; this.rebuildEdges(); this.rebuildHighlight(); this.rebuildWire();
    if (this.mesh) { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
