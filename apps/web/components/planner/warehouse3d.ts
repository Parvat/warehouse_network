import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOX_STRIDE, PARTS_3D, type Part3D, type Scene3D } from '@trace/rack-engine';

/**
 * The 3D warehouse, drawn with three.js.
 *
 * Loaded only when the 3D view is opened — nothing here is in the sheet's own
 * bundle. It places nothing itself: every box comes from the engine's
 * `warehouseScene`, which stands the plan's own geometry up. This file turns
 * each part's list into one instanced mesh, lights it, and lets the reader
 * orbit it.
 *
 * Drawn on demand: a frame is rendered when the camera moves, while it auto-
 * rotates, and on resize — never in a loop while the view sits still.
 */

export interface View3D {
  reset(): void;
  top(): void;
  setAutoRotate(on: boolean): void;
  dispose(): void;
}

/** The sheet's palette, as the mock has it. */
const COLOURS: Record<Part3D, number> = {
  upright: 0x14392b, beam: 0xc27a1e, rail: 0xc27a1e, pallet: 0xdac8a1,
  under: 0xe4e2d8, column: 0x14392b, arm: 0xc27a1e, base: 0x14392b, brace: 0x1d5240,
  steel: 0x9aa4ad, lumber: 0xc9a46a, dock: 0xf2c230, staging: 0xece6d3,
};
/** The skid under each load: the lower band of a pallet's one box. */
const SKID = 0xa88b5a;
/** Flat marks on the floor: lit, but they throw no shadow. */
const FLAT: ReadonlySet<Part3D> = new Set(['under', 'staging']);
/**
 * Past this many boxes the view goes light: no shadows — the pale shade under
 * every row still grounds the racking — and a lower pixel ratio. A 600 x 500
 * drive-in is tens of thousands of boxes, and the shadow pass draws every one
 * of them a second time.
 */
const HEAVY_BOXES = 20_000;

/**
 * A pallet as one box in two tones: the skid along the bottom, the load above.
 * One instance where there were two, with the same picture.
 */
function palletGeometry(skidFraction: number): THREE.BufferGeometry {
  const f = Math.min(0.9, Math.max(0.02, skidFraction));
  const part = (h: number, y: number, hex: number) => {
    const g = new THREE.BoxGeometry(1, h, 1).toNonIndexed();
    g.translate(0, y, 0);
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    return g;
  };
  const skid = part(f, -0.5 + f / 2, SKID);
  const load = part(1 - f, -0.5 + f + (1 - f) / 2, COLOURS.pallet);
  const merged = mergeGeometries([skid, load]);
  skid.dispose(); load.dispose();
  return merged;
}
/** three.js lights are physically scaled since r155; the mock's values were not. */
const LIGHT = Math.PI;

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Mounts the view into `host`; null where the browser has no WebGL. */
export function mountWarehouse(host: HTMLElement, s: Scene3D, onSpin: (on: boolean) => void): View3D | null {
  if (!hasWebGL()) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  const BL = s.lengthFt, BW = s.widthFt, CLEAR = s.clearHeightFt;
  // Everything that scales with the building — camera reach, fog, the sun's
  // shadow box — scales off its diagonal, so a 600 ft shed frames like a 240.
  const diag = Math.hypot(BL, BW);
  const k = diag / Math.hypot(240, 120);

  const boxes = PARTS_3D.reduce((n, p) => n + s.parts[p].length / BOX_STRIDE, 0);
  const heavy = boxes > HEAVY_BOXES;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, heavy ? 1.5 : 2));
  renderer.shadowMap.enabled = !heavy;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.cursor = 'grab';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f1ec);
  scene.fog = new THREE.Fog(0xf2f1ec, 1.9 * diag, 3.4 * diag);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 8 * diag);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c7bb, 0.85 * LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * LIGHT);
  sun.position.set(-160 * k, 260 * k, 140 * k);
  sun.castShadow = !heavy;
  sun.shadow.mapSize.set(2048, 2048);
  const half = Math.max(BL, BW) * 0.72;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 4 * diag });
  scene.add(sun);

  /* ── the building ─────────────────────────────────────────────────── */
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };

  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(BL, BW)),
    own(new THREE.MeshLambertMaterial({ color: 0xf7f6f2 })));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // a faint floor grid every 10 ft, inside the walls only
  const pts: number[] = [];
  for (let x = -BL / 2; x <= BL / 2 + 1e-6; x += 10) pts.push(x, 0.02, -BW / 2, x, 0.02, BW / 2);
  for (let z = -BW / 2; z <= BW / 2 + 1e-6; z += 10) pts.push(-BL / 2, 0.02, z, BL / 2, 0.02, z);
  const gridGeo = own(new THREE.BufferGeometry());
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(gridGeo, own(new THREE.LineBasicMaterial({ color: 0xe2e0d6 }))));

  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(12 * diag, 12 * diag)),
    own(new THREE.MeshLambertMaterial({ color: 0xe9e7de })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // a dark curb at the foot of each wall, glass to the clear height above it
  const curbMat = own(new THREE.MeshLambertMaterial({ color: 0x161c18 }));
  const glassMat = own(new THREE.MeshLambertMaterial({
    color: 0xd6d4c9, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
  }));
  const T = 0.8;
  for (const [x, z, w, d] of [[0, -BW / 2, BL + T, T], [0, BW / 2, BL + T, T], [-BL / 2, 0, T, BW + T], [BL / 2, 0, T, BW + T]] as const) {
    const curb = new THREE.Mesh(own(new THREE.BoxGeometry(w, 1.5, d)), curbMat);
    curb.position.set(x, 0.75, z);
    curb.castShadow = true;
    scene.add(curb);
    const glass = new THREE.Mesh(own(new THREE.BoxGeometry(w, CLEAR, d)), glassMat);
    glass.position.set(x, CLEAR / 2, z);
    scene.add(glass);
  }

  /* ── the racking: one instanced mesh per part ─────────────────────── */
  const unit = own(new THREE.BoxGeometry(1, 1, 1));
  const pallet = own(palletGeometry(s.palletSkidFraction));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), size = new THREE.Vector3();
  for (const part of PARTS_3D) {
    const boxes = s.parts[part];
    const n = boxes.length / BOX_STRIDE;
    if (n === 0) continue;
    const isPallet = part === 'pallet';
    const mat = own(new THREE.MeshLambertMaterial(isPallet ? { vertexColors: true } : { color: COLOURS[part] }));
    const mesh = own(new THREE.InstancedMesh(isPallet ? pallet : unit, mat, n));
    mesh.castShadow = !FLAT.has(part);
    mesh.receiveShadow = true;
    for (let i = 0; i < n; i++) {
      const o = i * BOX_STRIDE;
      pos.set(boxes[o]!, boxes[o + 1]!, boxes[o + 2]!);
      size.set(boxes[o + 3]!, boxes[o + 4]!, boxes[o + 5]!);
      e.set(boxes[o + 6]!, 0, boxes[o + 7]!);
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(pos, q, size));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  /* ── the camera ───────────────────────────────────────────────────── */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  // never below the floor, never so close the building fills the lens
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 0.12 * diag;
  controls.maxDistance = 3 * diag;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 1.2;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  const place = (radius: number, phi: number, theta: number, ty: number) => {
    controls.target.set(0, ty, 0);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSphericalCoords(radius, phi, theta));
    camera.lookAt(controls.target);
    controls.update();
  };
  const home = () => place(1.12 * diag, 0.95, -0.75, 6);

  /* ── drawing on demand ────────────────────────────────────────────── */
  let frame = 0;
  let spinning = false;
  const draw = () => {
    frame = 0;
    if (spinning) controls.update();
    renderer.render(scene, camera);
    if (spinning) request();
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(draw); };
  controls.addEventListener('change', () => {
    // panned below the floor is not a view of anything
    if (controls.target.y < 0) controls.target.y = 0;
    request();
  });
  // grabbing the view stops it turning, as the mock does
  const onStart = () => {
    renderer.domElement.style.cursor = 'grabbing';
    if (spinning) { spinning = false; controls.autoRotate = false; onSpin(false); }
  };
  const onEnd = () => { renderer.domElement.style.cursor = 'grab'; };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  const noMenu = (ev: Event) => ev.preventDefault();
  renderer.domElement.addEventListener('contextmenu', noMenu);

  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  home();

  return {
    reset() { home(); request(); },
    top() { place(1.05 * diag, 0.12, 0, 0); request(); },
    setAutoRotate(on) {
      spinning = on;
      controls.autoRotate = on;
      request();
    },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      spinning = false;
      ro.disconnect();
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      renderer.domElement.removeEventListener('contextmenu', noMenu);
      controls.dispose();
      for (const x of owned) x.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
