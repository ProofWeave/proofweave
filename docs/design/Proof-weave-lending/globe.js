/* ProofWeave — Earth-like dot-matrix data globe
   Lat/long dot grid (meridian convergence reads as a globe),
   great-circle orbital rings, glowing pin-nodes riding the orbits,
   a few subtle trade arcs. Auto-rotate + pointer drift + breathing pulse.
   No floating sparkle particles. */
(function () {
  'use strict';

  var mount = document.getElementById('globe');
  if (!mount) return;

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!window.THREE || !hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  // ---- Palette -------------------------------------------------------------
  var RAMP = ['#DCEFEC', '#BADED9', '#97CEC7', '#74BEB4',
              '#52ADA1', '#418B81', '#316861', '#214540'];
  var CYAN = '#22D3EE';
  function col(hex) { return new THREE.Color(hex); }

  var W = mount.clientWidth || mount.offsetWidth || Math.round(window.innerWidth * 0.7);
  var H = mount.clientHeight || mount.offsetHeight || window.innerHeight;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 3.55);

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  mount.appendChild(renderer.domElement);
  var PIX = renderer.getPixelRatio();

  var group = new THREE.Group();
  group.rotation.z = 0.38;   // axial tilt
  scene.add(group);

  var R = 1.0;
  var baseX = 0;   // horizontal offset so the globe sits on the right

  function randSurface() {
    var u = Math.random(), v = Math.random();
    var theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
    return new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );
  }

  // ---- Network sphere: nodes + edges (Global Network Architecture) ----------
  // The globe body is a constellation of data nodes wired into a mesh — hub
  // nodes (accent-coloured) can anchor data-type labels. Sparse, glassy, glow.
  var NODE_COUNT = 184;
  var dir = [];
  for (var ni = 0; ni < NODE_COUNT; ni++) {
    var phiF = Math.acos(1 - 2 * (ni + 0.5) / NODE_COUNT);
    var thF = Math.PI * (1 + Math.sqrt(5)) * ni;
    dir.push(new THREE.Vector3(
      Math.sin(phiF) * Math.cos(thF),
      Math.cos(phiF),
      Math.sin(phiF) * Math.sin(thF)
    ));
  }
  // hub (data-type anchor) nodes — accent colours from the network palette
  var HUB = {};
  [{ i: 18, c: '#06B6D4' }, { i: 52, c: '#F59E0B' }, { i: 88, c: '#3B82F6' },
   { i: 120, c: '#22D3EE' }, { i: 150, c: '#F59E0B' }, { i: 172, c: '#06B6D4' }]
    .forEach(function (h) { HUB[h.i] = h.c; });
  var NODE_RAMP = ['#9AECF5', '#5FD7E0', '#3FB7C7', '#2E94A8'];

  var nN = NODE_COUNT;
  var npos = new Float32Array(nN * 3);
  var ncol = new Float32Array(nN * 3);
  var nsz = new Float32Array(nN);
  for (var i = 0; i < nN; i++) {
    var d3 = dir[i];
    npos[i * 3] = d3.x * R; npos[i * 3 + 1] = d3.y * R; npos[i * 3 + 2] = d3.z * R;
    var c;
    if (HUB[i]) { c = col(HUB[i]); nsz[i] = 3.0 + Math.random() * 1.0; }
    else {
      c = col(NODE_RAMP[Math.min(3, (Math.random() * 1.6 | 0) + (Math.random() < 0.3 ? 1 : 0))]);
      nsz[i] = 0.85 + Math.random() * 0.6;
    }
    ncol[i * 3] = c.r; ncol[i * 3 + 1] = c.g; ncol[i * 3 + 2] = c.b;
  }

  // edges: wire each node to its nearest neighbours (deduped) -> geodesic mesh
  var EDGES = [], seen = {}, K = 3;
  for (var a = 0; a < nN; a++) {
    var ds = [];
    for (var b = 0; b < nN; b++) if (b !== a) ds.push([dir[a].distanceToSquared(dir[b]), b]);
    ds.sort(function (x, y) { return x[0] - y[0]; });
    for (var kk = 0; kk < K; kk++) {
      var nb = ds[kk][1];
      var key = a < nb ? a + '_' + nb : nb + '_' + a;
      if (!seen[key]) { seen[key] = 1; EDGES.push([a, nb]); }
    }
  }
  var EN = EDGES.length;
  var epos = new Float32Array(EN * 6);
  for (var e = 0; e < EN; e++) {
    var ai = EDGES[e][0], bi = EDGES[e][1];
    epos[e * 6] = npos[ai * 3]; epos[e * 6 + 1] = npos[ai * 3 + 1]; epos[e * 6 + 2] = npos[ai * 3 + 2];
    epos[e * 6 + 3] = npos[bi * 3]; epos[e * 6 + 4] = npos[bi * 3 + 1]; epos[e * 6 + 5] = npos[bi * 3 + 2];
  }
  var eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(epos, 3));
  var edgeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col('#2FA7C4') }, uNear: { value: 3.0 }, uFar: { value: 4.7 }, uOpacity: { value: 0.42 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'varying float vFade; uniform float uNear; uniform float uFar;',
      'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);',
      ' float depth = -mv.z; float f = 1.0 - smoothstep(uNear,uFar,depth);',
      ' vFade = 0.04 + 0.96*f*f;',
      ' gl_Position = projectionMatrix * mv; }'
    ].join('\n'),
    fragmentShader: [
      'varying float vFade; uniform vec3 uColor; uniform float uOpacity;',
      'void main(){ gl_FragColor = vec4(uColor, uOpacity*vFade); }'
    ].join('\n')
  });
  var edges = new THREE.LineSegments(eg, edgeMat);
  group.add(edges);

  var ng2 = new THREE.BufferGeometry();
  ng2.setAttribute('position', new THREE.BufferAttribute(npos, 3));
  ng2.setAttribute('aColor', new THREE.BufferAttribute(ncol, 3));
  ng2.setAttribute('aSize', new THREE.BufferAttribute(nsz, 1));
  var nodeMat = new THREE.ShaderMaterial({
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
      ' gl_Position = projectionMatrix * mv; }'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vFade; uniform float uOpacity;',
      'void main(){ vec2 c = gl_PointCoord - vec2(0.5); float d = length(c); if(d>0.5) discard;',
      ' float core = smoothstep(0.5,0.06,d);',
      ' float glow = smoothstep(0.5,0.24,d)*0.4;',
      ' gl_FragColor = vec4(vColor, (core+glow)*vFade*uOpacity); }'
    ].join('\n')
  });
  var nodes = new THREE.Points(ng2, nodeMat);
  group.add(nodes);

  // ---- Floating data-keyword labels (glass cards on hub nodes) -------------
  var LABEL_DATA = {
    18:  { type: 'card', k: 'GEOSPATIAL', v: 'Active Stream' },
    52:  { type: 'pill', v: '24.8 TB/s' },
    88:  { type: 'card', k: 'FINANCIAL', v: 'On-chain Feed' },
    120: { type: 'pill', v: '1.24M proofs' },
    150: { type: 'card', k: 'GENOMIC', v: 'Verified' },
    172: { type: 'pill', v: '99.99% uptime' }
  };
  var labels = [];
  Object.keys(LABEL_DATA).forEach(function (key) {
    var idx = +key, info = LABEL_DATA[key];
    var el = document.createElement('div');
    el.className = 'gnode-label' + (info.type === 'pill' ? ' gnode-label--pill' : '');
    el.innerHTML = info.type === 'pill'
      ? '<span class="gnd-dot"></span><span class="gnd-v">' + info.v + '</span>'
      : '<span class="gnd-k">' + info.k + '</span><span class="gnd-v">' + info.v + '</span>';
    mount.appendChild(el);
    labels.push({ el: el, dir: dir[idx].clone() });
  });

  // ---- Great-circle orbital rings ------------------------------------------
  // A few inclined orbits (not a lat/long cage). Pins ride these.
  function circleGeom(radius) {
    var pts = [], seg = 160;
    for (var k = 0; k <= seg; k++) {
      var a = (k / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }
  var ORBITS = [
    { rx: 0.34, ry: 0.0,  rz: 0.12, r: 1.38 },
    { rx: 1.18, ry: 0.5,  rz: 0.0,  r: 1.52 },
    { rx: -0.55, ry: 1.1, rz: 0.2,  r: 1.46 },
    { rx: 0.9,  ry: 2.0,  rz: -0.3, r: 1.62 }
  ];
  // Orbit shader: bright where the ring arcs OUTSIDE the globe silhouette,
  // faded where a near-side segment would cut across the globe face.
  function orbitMaterial(baseOpacity) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col('#7FD7CC') }, uOpacity: { value: baseOpacity }, uR: { value: R } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: [
        'uniform float uR;',
        'varying float vFade;',
        'void main(){',
        ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
        ' vec3 Cv = (modelViewMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;', // globe centre, view space
        ' vec3 Pv = mv.xyz;',
        ' vec3 dir = normalize(Pv);',
        ' float along = dot(Cv, dir);',
        ' float perp = length(Cv - dir*along);',          // ray-to-centre distance
        ' float insideSil = 1.0 - smoothstep(uR*0.86, uR*1.04, perp);', // 1 if within silhouette
        ' float inFront = step(length(Pv), along);',       // nearer than centre => in front
        ' vFade = 1.0 - 0.92*insideSil*inFront;',          // hide front segments over the face
        ' gl_Position = projectionMatrix * mv; }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uOpacity;',
        'varying float vFade;',
        'void main(){ gl_FragColor = vec4(uColor, uOpacity*vFade); }'
      ].join('\n')
    });
  }
  var orbitObjs = [];
  ORBITS.forEach(function (o) {
    var obj = new THREE.Object3D();
    obj.rotation.set(o.rx, o.ry, o.rz);
    obj.updateMatrix();
    var line = new THREE.LineLoop(circleGeom(o.r), orbitMaterial(0.5));
    obj.add(line);
    group.add(obj);
    orbitObjs.push({ obj: obj, r: o.r });
  });

  // ---- Pin nodes (clean circular glowing dots, riding the outer orbits) ----
  var PIN_N = 7;
  var pinDefs = [];
  var ppos = new Float32Array(PIN_N * 3);
  var pcol = new Float32Array(PIN_N * 3);
  var psz = new Float32Array(PIN_N);
  var startAngles = [4.2, 4.8, 5.3, 3.7, 1.3, 0.4, 2.4]; // bias toward lower arc
  for (var pn = 0; pn < PIN_N; pn++) {
    var oi = pn % orbitObjs.length;
    pinDefs.push({ oi: oi, ang: startAngles[pn], spd: (0.03 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1) });
    var c2 = col(pn % 3 === 0 ? '#DCEFEC' : CYAN);
    pcol[pn * 3] = c2.r; pcol[pn * 3 + 1] = c2.g; pcol[pn * 3 + 2] = c2.b;
    psz[pn] = 2.7 + Math.random() * 0.8;
  }
  var pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pg.setAttribute('aColor', new THREE.BufferAttribute(pcol, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(psz, 1));
  var pinMat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: PIX } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'attribute float aSize; attribute vec3 aColor;',
      'varying vec3 vColor; varying float vFront;',
      'uniform float uPix;',
      'void main(){ vColor=aColor;',
      ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
      ' vFront = 1.0 - smoothstep(3.5,4.7,-mv.z);',  // 1 near, 0 behind globe
      ' gl_PointSize = aSize * uPix * (24.0 / -mv.z);',
      ' gl_Position = projectionMatrix * mv; }'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vFront;',
      'void main(){ vec2 c = gl_PointCoord - vec2(0.5);',
      ' float d = length(c); if(d>0.5) discard;',
      ' float core = smoothstep(0.30,0.04,d);',     // solid round centre
      ' float glow = smoothstep(0.5,0.30,d)*0.30;',  // soft circular halo
      ' float vis = 0.28 + 0.72*vFront;',
      ' float a = (core + glow) * vis;',
      ' gl_FragColor = vec4(vColor, a); }'
    ].join('\n')
  });
  var pins = new THREE.Points(pg, pinMat);
  group.add(pins);

  // ---- Pointer drift --------------------------------------------------------
  var tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  window.addEventListener('pointermove', function (e) {
    var nx = (e.clientX / window.innerWidth) * 2 - 1;
    var ny = (e.clientY / window.innerHeight) * 2 - 1;
    tgt.x = ny * 0.16; tgt.y = nx * 0.24;
  }, { passive: true });

  // ---- Resize ---------------------------------------------------------------
  function resize() {
    var nw = mount.clientWidth || mount.offsetWidth;
    var nh = mount.clientHeight || mount.offsetHeight;
    if (!nw || !nh) return;            // element not laid out yet — skip
    W = nw; H = nh;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    // place the globe at ~72% of width so orbits have room (no hard clip)
    var halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
    baseX = (0.72 * 2 - 1) * halfH * camera.aspect;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  // Re-measure once layout/CSS/fonts settle (fixes the clientWidth===0 race).
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(mount);
  } else {
    requestAnimationFrame(resize);
    setTimeout(resize, 300);
  }
  // Backstop that fires even when requestAnimationFrame is throttled (e.g. the
  // tab/iframe is backgrounded): heals the 0-width init race within ~0.5s.
  setInterval(function () {
    var nw = mount.clientWidth || mount.offsetWidth;
    var nh = mount.clientHeight || mount.offsetHeight;
    if (nw && nh &&
        (renderer.domElement.width !== Math.floor(nw * PIX) ||
         renderer.domElement.height !== Math.floor(nh * PIX))) {
      resize();
    }
  }, 500);

  // ---- Animate --------------------------------------------------------------
  var clock = new THREE.Clock();
  var tmp = new THREE.Vector3();
  var lp = new THREE.Vector3();
  var wp = new THREE.Vector3(), gp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3(), proj = new THREE.Vector3();
  function smooth(e0, e1, x) { var tt = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return tt * tt * (3 - 2 * tt); }
  function updateLabels() {
    gp.setFromMatrixPosition(group.matrixWorld);
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      wp.copy(L.dir).multiplyScalar(R).applyMatrix4(group.matrixWorld);
      nrm.copy(wp).sub(gp).normalize();
      toCam.copy(camera.position).sub(wp).normalize();
      var op = smooth(0.12, 0.5, nrm.dot(toCam));
      if (op <= 0.02) { L.el.style.opacity = '0'; continue; }
      proj.copy(wp).project(camera);
      L.el.style.left = ((proj.x * 0.5 + 0.5) * W).toFixed(0) + 'px';
      L.el.style.top = ((-proj.y * 0.5 + 0.5) * H).toFixed(0) + 'px';
      L.el.style.opacity = op.toFixed(2);
    }
  }
  function tick() {
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    // Self-healing size check — corrects the 0-width init race within one
    // frame regardless of whether resize events / ResizeObserver fire.
    var needW = mount.clientWidth || mount.offsetWidth;
    var needH = mount.clientHeight || mount.offsetHeight;
    if (needW && needH &&
        (renderer.domElement.width !== Math.floor(needW * PIX) ||
         renderer.domElement.height !== Math.floor(needH * PIX))) {
      resize();
    }

    group.rotation.y += dt * 0.17;
    cur.x += (tgt.x - cur.x) * 0.04;
    cur.y += (tgt.y - cur.y) * 0.04;
    group.rotation.x = cur.x;
    group.position.x = baseX + cur.y * 0.04;

    // breathing pulse
    var pulse = 1 + Math.sin(t * (Math.PI * 2 / 7)) * 0.01;
    group.scale.setScalar(pulse);
    var breathe = 0.84 + Math.sin(t * (Math.PI * 2 / 5)) * 0.10;
    nodeMat.uniforms.uOpacity.value = breathe;
    edgeMat.uniforms.uOpacity.value = 0.42 * breathe;

    // pins ride their orbits
    for (var pn = 0; pn < PIN_N; pn++) {
      var def = pinDefs[pn];
      def.ang += dt * def.spd;
      var ob = orbitObjs[def.oi];
      lp.set(Math.cos(def.ang) * ob.r, 0, Math.sin(def.ang) * ob.r);
      lp.applyMatrix4(ob.obj.matrix);
      ppos[pn * 3] = lp.x; ppos[pn * 3 + 1] = lp.y; ppos[pn * 3 + 2] = lp.z;
    }
    pg.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(tick);
  }
  mount.classList.add('globe-ready');
  tick();
})();
