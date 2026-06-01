/* eslint-disable @typescript-eslint/no-explicit-any */
/* ProofWeave landing globe — dot-matrix data-provenance sphere.
   Ported from the design bundle's globe.js (three.js r128). three is loaded
   from CDN on demand so it never lands in the app's main bundle; if WebGL or
   the script is unavailable, the `.no-webgl` CSS fallback in landing.css shows
   a static motif instead. The whole scene is torn down on unmount. */
import { useEffect, useRef } from 'react';

const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
let threePromise: Promise<any> | null = null;

function loadThree(): Promise<any> {
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = THREE_SRC;
    s.async = true;
    s.onload = () => resolve((window as any).THREE);
    s.onerror = () => reject(new Error('three.js failed to load'));
    document.head.appendChild(s);
  });
  return threePromise;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/* Neutralised hub labels — fabricated metrics from the design
   (24.8 TB/s, 1.24M proofs, 99.99% uptime) replaced with honest descriptors. */
const LABEL_DATA: Record<number, { type: 'card' | 'pill'; k?: string; v: string }> = {
  18: { type: 'card', k: 'GEOSPATIAL', v: 'Provenance' },
  52: { type: 'pill', v: 'Verifiable' },
  88: { type: 'card', k: 'FINANCIAL', v: 'On-chain' },
  120: { type: 'pill', v: 'On-chain proof' },
  150: { type: 'card', k: 'GENOMIC', v: 'Verified' },
  172: { type: 'pill', v: 'x402 payment' },
};

function createGlobe(mount: HTMLDivElement, THREE: any): () => void {
  const col = (hex: string) => new THREE.Color(hex);
  const CYAN = '#22D3EE';

  let W = mount.clientWidth || mount.offsetWidth || Math.round(window.innerWidth * 0.7);
  let H = mount.clientHeight || mount.offsetHeight || window.innerHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 3.3); // slightly closer so the globe reads larger / sits forward

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  mount.appendChild(renderer.domElement);
  const PIX = renderer.getPixelRatio();

  const group = new THREE.Group();
  group.rotation.z = 0.38; // axial tilt
  scene.add(group);

  const R = 1.0;
  let baseX = 0;

  // ---- Network sphere: nodes + edges ----------------------------------------
  const NODE_COUNT = 184;
  const dir: any[] = [];
  for (let ni = 0; ni < NODE_COUNT; ni++) {
    const phiF = Math.acos(1 - (2 * (ni + 0.5)) / NODE_COUNT);
    const thF = Math.PI * (1 + Math.sqrt(5)) * ni;
    dir.push(new THREE.Vector3(Math.sin(phiF) * Math.cos(thF), Math.cos(phiF), Math.sin(phiF) * Math.sin(thF)));
  }
  const HUB: Record<number, string> = {};
  [{ i: 18, c: '#06B6D4' }, { i: 52, c: '#F59E0B' }, { i: 88, c: '#3B82F6' },
   { i: 120, c: '#22D3EE' }, { i: 150, c: '#F59E0B' }, { i: 172, c: '#06B6D4' }]
    .forEach((h) => { HUB[h.i] = h.c; });
  const NODE_RAMP = ['#9AECF5', '#5FD7E0', '#3FB7C7', '#2E94A8'];

  const nN = NODE_COUNT;
  const npos = new Float32Array(nN * 3);
  const ncol = new Float32Array(nN * 3);
  const nsz = new Float32Array(nN);
  for (let i = 0; i < nN; i++) {
    const d3 = dir[i];
    npos[i * 3] = d3.x * R; npos[i * 3 + 1] = d3.y * R; npos[i * 3 + 2] = d3.z * R;
    let c;
    if (HUB[i]) { c = col(HUB[i]); nsz[i] = 3.0 + Math.random() * 1.0; }
    else {
      c = col(NODE_RAMP[Math.min(3, ((Math.random() * 1.6) | 0) + (Math.random() < 0.3 ? 1 : 0))]);
      nsz[i] = 0.85 + Math.random() * 0.6;
    }
    ncol[i * 3] = c.r; ncol[i * 3 + 1] = c.g; ncol[i * 3 + 2] = c.b;
  }

  const EDGES: [number, number][] = [];
  const seen: Record<string, number> = {};
  const K = 3;
  for (let a = 0; a < nN; a++) {
    const ds: [number, number][] = [];
    for (let b = 0; b < nN; b++) if (b !== a) ds.push([dir[a].distanceToSquared(dir[b]), b]);
    ds.sort((x, y) => x[0] - y[0]);
    for (let kk = 0; kk < K; kk++) {
      const nb = ds[kk][1];
      const key = a < nb ? a + '_' + nb : nb + '_' + a;
      if (!seen[key]) { seen[key] = 1; EDGES.push([a, nb]); }
    }
  }
  const EN = EDGES.length;
  const epos = new Float32Array(EN * 6);
  for (let e = 0; e < EN; e++) {
    const ai = EDGES[e][0], bi = EDGES[e][1];
    epos[e * 6] = npos[ai * 3]; epos[e * 6 + 1] = npos[ai * 3 + 1]; epos[e * 6 + 2] = npos[ai * 3 + 2];
    epos[e * 6 + 3] = npos[bi * 3]; epos[e * 6 + 4] = npos[bi * 3 + 1]; epos[e * 6 + 5] = npos[bi * 3 + 2];
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(epos, 3));
  const edgeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col('#2FA7C4') }, uNear: { value: 3.0 }, uFar: { value: 4.7 }, uOpacity: { value: 0.42 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'varying float vFade; uniform float uNear; uniform float uFar;',
      'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);',
      ' float depth = -mv.z; float f = 1.0 - smoothstep(uNear,uFar,depth);',
      ' vFade = 0.04 + 0.96*f*f;',
      ' gl_Position = projectionMatrix * mv; }',
    ].join('\n'),
    fragmentShader: [
      'varying float vFade; uniform vec3 uColor; uniform float uOpacity;',
      'void main(){ gl_FragColor = vec4(uColor, uOpacity*vFade); }',
    ].join('\n'),
  });
  const edges = new THREE.LineSegments(eg, edgeMat);
  group.add(edges);

  const ng2 = new THREE.BufferGeometry();
  ng2.setAttribute('position', new THREE.BufferAttribute(npos, 3));
  ng2.setAttribute('aColor', new THREE.BufferAttribute(ncol, 3));
  ng2.setAttribute('aSize', new THREE.BufferAttribute(nsz, 1));
  const nodeMat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: PIX }, uNear: { value: 3.0 }, uFar: { value: 4.7 }, uOpacity: { value: 1.0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'attribute float aSize; attribute vec3 aColor;',
      'varying vec3 vColor; varying float vFade;',
      'uniform float uPix; uniform float uNear; uniform float uFar;',
      'void main(){ vColor = aColor;',
      ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
      ' float depth = -mv.z; float f = 1.0 - smoothstep(uNear,uFar,depth);',
      ' vFade = 0.10 + 0.90*f*f;',
      ' gl_PointSize = aSize * uPix * (55.0 / -mv.z);',
      ' gl_Position = projectionMatrix * mv; }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vFade; uniform float uOpacity;',
      'void main(){ vec2 c = gl_PointCoord - vec2(0.5); float d = length(c); if(d>0.5) discard;',
      ' float core = smoothstep(0.5,0.06,d);',
      ' float glow = smoothstep(0.5,0.24,d)*0.4;',
      ' gl_FragColor = vec4(vColor, (core+glow)*vFade*uOpacity); }',
    ].join('\n'),
  });
  const nodes = new THREE.Points(ng2, nodeMat);
  group.add(nodes);

  // ---- Floating data-keyword labels (glass cards on hub nodes) --------------
  const labels: { el: HTMLDivElement; dir: any }[] = [];
  Object.keys(LABEL_DATA).forEach((key) => {
    const idx = +key, info = LABEL_DATA[idx];
    const el = document.createElement('div');
    el.className = 'gnode-label' + (info.type === 'pill' ? ' gnode-label--pill' : '');
    el.innerHTML = info.type === 'pill'
      ? '<span class="gnd-dot"></span><span class="gnd-v">' + info.v + '</span>'
      : '<span class="gnd-k">' + info.k + '</span><span class="gnd-v">' + info.v + '</span>';
    mount.appendChild(el);
    labels.push({ el, dir: dir[idx].clone() });
  });

  // ---- Great-circle orbital rings -------------------------------------------
  function circleGeom(radius: number) {
    const pts: any[] = [], seg = 160;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }
  const ORBITS = [
    { rx: 0.34, ry: 0.0, rz: 0.12, r: 1.38 },
    { rx: 1.18, ry: 0.5, rz: 0.0, r: 1.52 },
    { rx: -0.55, ry: 1.1, rz: 0.2, r: 1.46 },
    { rx: 0.9, ry: 2.0, rz: -0.3, r: 1.62 },
  ];
  function orbitMaterial(baseOpacity: number) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col('#7FD7CC') }, uOpacity: { value: baseOpacity }, uR: { value: R } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: [
        'uniform float uR;',
        'varying float vFade;',
        'void main(){',
        ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
        ' vec3 Cv = (modelViewMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;',
        ' vec3 Pv = mv.xyz;',
        ' vec3 dir = normalize(Pv);',
        ' float along = dot(Cv, dir);',
        ' float perp = length(Cv - dir*along);',
        ' float insideSil = 1.0 - smoothstep(uR*0.86, uR*1.04, perp);',
        ' float inFront = step(length(Pv), along);',
        ' vFade = 1.0 - 0.92*insideSil*inFront;',
        ' gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uOpacity;',
        'varying float vFade;',
        'void main(){ gl_FragColor = vec4(uColor, uOpacity*vFade); }',
      ].join('\n'),
    });
  }
  const orbitObjs: { obj: any; r: number }[] = [];
  ORBITS.forEach((o) => {
    const obj = new THREE.Object3D();
    obj.rotation.set(o.rx, o.ry, o.rz);
    obj.updateMatrix();
    const line = new THREE.LineLoop(circleGeom(o.r), orbitMaterial(0.5));
    obj.add(line);
    group.add(obj);
    orbitObjs.push({ obj, r: o.r });
  });

  // ---- Pin nodes (glowing dots riding the outer orbits) ---------------------
  const PIN_N = 7;
  const pinDefs: { oi: number; ang: number; spd: number }[] = [];
  const ppos = new Float32Array(PIN_N * 3);
  const pcol = new Float32Array(PIN_N * 3);
  const psz = new Float32Array(PIN_N);
  const startAngles = [4.2, 4.8, 5.3, 3.7, 1.3, 0.4, 2.4];
  for (let pn = 0; pn < PIN_N; pn++) {
    const oi = pn % orbitObjs.length;
    pinDefs.push({ oi, ang: startAngles[pn], spd: (0.03 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1) });
    const c2 = col(pn % 3 === 0 ? '#DCEFEC' : CYAN);
    pcol[pn * 3] = c2.r; pcol[pn * 3 + 1] = c2.g; pcol[pn * 3 + 2] = c2.b;
    psz[pn] = 2.7 + Math.random() * 0.8;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pg.setAttribute('aColor', new THREE.BufferAttribute(pcol, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(psz, 1));
  const pinMat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: PIX } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'attribute float aSize; attribute vec3 aColor;',
      'varying vec3 vColor; varying float vFront;',
      'uniform float uPix;',
      'void main(){ vColor=aColor;',
      ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
      ' vFront = 1.0 - smoothstep(3.5,4.7,-mv.z);',
      ' gl_PointSize = aSize * uPix * (24.0 / -mv.z);',
      ' gl_Position = projectionMatrix * mv; }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vFront;',
      'void main(){ vec2 c = gl_PointCoord - vec2(0.5);',
      ' float d = length(c); if(d>0.5) discard;',
      ' float core = smoothstep(0.30,0.04,d);',
      ' float glow = smoothstep(0.5,0.30,d)*0.30;',
      ' float vis = 0.28 + 0.72*vFront;',
      ' float a = (core + glow) * vis;',
      ' gl_FragColor = vec4(vColor, a); }',
    ].join('\n'),
  });
  const pins = new THREE.Points(pg, pinMat);
  group.add(pins);

  // ---- Interaction + lifecycle ----------------------------------------------
  const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  function onPointerMove(e: PointerEvent) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    tgt.x = ny * 0.16; tgt.y = nx * 0.24;
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  function resize() {
    const nw = mount.clientWidth || mount.offsetWidth;
    const nh = mount.clientHeight || mount.offsetHeight;
    if (!nw || !nh) return;
    W = nw; H = nh;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    const halfH = Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.position.z;
    baseX = (0.72 * 2 - 1) * halfH * camera.aspect;
  }
  window.addEventListener('resize', resize);

  let ro: ResizeObserver | null = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => resize());
    ro.observe(mount);
  } else {
    requestAnimationFrame(resize);
    setTimeout(resize, 300);
  }
  const healInterval = window.setInterval(() => {
    const nw = mount.clientWidth || mount.offsetWidth;
    const nh = mount.clientHeight || mount.offsetHeight;
    if (nw && nh && (renderer.domElement.width !== Math.floor(nw * PIX) || renderer.domElement.height !== Math.floor(nh * PIX))) resize();
  }, 500);

  const clock = new THREE.Clock();
  const lp = new THREE.Vector3();
  const wp = new THREE.Vector3(), gp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3(), proj = new THREE.Vector3();
  function smooth(e0: number, e1: number, x: number) { const tt = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return tt * tt * (3 - 2 * tt); }
  function updateLabels() {
    gp.setFromMatrixPosition(group.matrixWorld);
    for (let i = 0; i < labels.length; i++) {
      const L = labels[i];
      wp.copy(L.dir).multiplyScalar(R).applyMatrix4(group.matrixWorld);
      nrm.copy(wp).sub(gp).normalize();
      toCam.copy(camera.position).sub(wp).normalize();
      const op = smooth(0.12, 0.5, nrm.dot(toCam));
      if (op <= 0.02) { L.el.style.opacity = '0'; continue; }
      proj.copy(wp).project(camera);
      L.el.style.left = ((proj.x * 0.5 + 0.5) * W).toFixed(0) + 'px';
      L.el.style.top = ((-proj.y * 0.5 + 0.5) * H).toFixed(0) + 'px';
      L.el.style.opacity = op.toFixed(2);
    }
  }

  let rafId = 0;
  let disposed = false;
  function tick() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    const needW = mount.clientWidth || mount.offsetWidth;
    const needH = mount.clientHeight || mount.offsetHeight;
    if (needW && needH && (renderer.domElement.width !== Math.floor(needW * PIX) || renderer.domElement.height !== Math.floor(needH * PIX))) resize();

    group.rotation.y += dt * 0.17;
    cur.x += (tgt.x - cur.x) * 0.04;
    cur.y += (tgt.y - cur.y) * 0.04;
    group.rotation.x = cur.x;
    group.position.x = baseX + cur.y * 0.04;

    const pulse = 1 + Math.sin(t * ((Math.PI * 2) / 7)) * 0.01;
    group.scale.setScalar(pulse);
    const breathe = 0.84 + Math.sin(t * ((Math.PI * 2) / 5)) * 0.1;
    nodeMat.uniforms.uOpacity.value = breathe;
    edgeMat.uniforms.uOpacity.value = 0.42 * breathe;

    for (let pn = 0; pn < PIN_N; pn++) {
      const def = pinDefs[pn];
      def.ang += dt * def.spd;
      const ob = orbitObjs[def.oi];
      lp.set(Math.cos(def.ang) * ob.r, 0, Math.sin(def.ang) * ob.r);
      lp.applyMatrix4(ob.obj.matrix);
      ppos[pn * 3] = lp.x; ppos[pn * 3 + 1] = lp.y; ppos[pn * 3 + 2] = lp.z;
    }
    pg.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    updateLabels();
    rafId = requestAnimationFrame(tick);
  }
  resize();
  mount.classList.add('globe-ready');
  tick();

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.clearInterval(healInterval);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', resize);
    if (ro) ro.disconnect();
    labels.forEach((L) => L.el.remove());
    try { renderer.dispose(); } catch { /* noop */ }
    if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    mount.classList.remove('globe-ready');
  };
}

export default function GlobeCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (!hasWebGL()) {
      mount.closest('.pw-land')?.classList.add('no-webgl');
      return;
    }
    let dispose: (() => void) | null = null;
    let cancelled = false;
    loadThree()
      .then((THREE) => {
        if (cancelled || !mountRef.current) return;
        dispose = createGlobe(mountRef.current, THREE);
      })
      .catch(() => {
        mountRef.current?.closest('.pw-land')?.classList.add('no-webgl');
      });
    return () => {
      cancelled = true;
      if (dispose) dispose();
    };
  }, []);

  return <div ref={mountRef} id="globe" aria-hidden="true" />;
}
