import { clamp, smoothstep } from './scroll-timeline.mjs';

/*
 * 棉小柔 cinematic stage (v2).
 * One persistent product in one world; the camera orbits/dollies along chapter keyframes.
 * Each chapter owns a background plate, camera-space foreground layers and local effects.
 * CAD part motion is a visual preview only — not a verified hinge, axis or drawer stroke.
 */

const BG_FILES = {
  hero: 'bg-hero.webp', scan: 'bg-scan.webp', structure: 'bg-structure.webp',
  water: 'bg-water.webp', texture: 'bg-texture.webp', closing: 'bg-closing.webp',
};

// x/y: fraction of half-frame at that depth; d: distance from camera; h: height as fraction of frame height
const FG_LAYERS = {
  blinds: { file: 'fg-blinds-light.webp', x: -0.25, y: 0.2, d: 3.4, h: 1.25, opacity: 0.75, drift: -0.18, additive: true },
  branch: { file: 'fg-branch-blur.webp', x: -0.78, y: 0.5, d: 2.2, h: 0.62, opacity: 1, drift: -0.55 },
  curtain: { file: 'foreground-01.webp', x: 0.93, y: 0.0, d: 2.6, h: 1.25, opacity: 0.7, drift: -0.35 },
  sprig: { file: 'foreground-02.webp', x: 0.88, y: -0.62, d: 2.4, h: 0.55, opacity: 0.95, drift: -0.5 },
  droplets: { file: 'foreground-07.webp', x: -0.62, y: 0.35, d: 2.8, h: 0.5, opacity: 0.85, drift: -0.4 },
  fiber: { file: 'foreground-08.webp', x: 0.55, y: 0.4, d: 2.6, h: 0.75, opacity: 0.7, drift: -0.45 },
  bokeh: { file: 'foreground-10.webp', x: 0.1, y: 0.45, d: 3.6, h: 1.0, opacity: 0.55, drift: -0.2, additive: true },
  towel: { file: 'foreground-05.webp', x: -0.82, y: -0.72, d: 2.5, h: 0.48, opacity: 1, drift: -0.5 },
};

// Camera keyframes. az: orbit angle (rad, + = camera right of product front); el: elevation;
// dist: distance; ty: look target height offset; ox: horizontal frame offset (+ pushes product right).
const CHAPTERS = [
  { id: 'intro', bg: 'hero', fg: ['blinds', 'branch', 'sprig'], az: 0.72, el: 0.07, dist: 10.6, ty: 0.15, ox: 0.14, pan: -0.04, word: 1, light: 'warm' },
  { id: 'scan', bg: 'scan', fg: ['bokeh'], az: 0.16, el: 0.03, dist: 5.6, ty: 0.42, ox: 0.2, pan: 0, scan: 1, screen: 1, light: 'cool' },
  { id: 'result', bg: 'scan', fg: ['bokeh'], az: -0.3, el: 0.1, dist: 6.6, ty: 0.32, ox: 0.22, pan: 0.03, screen: 1, light: 'cool' },
  { id: 'structure', bg: 'structure', fg: [], az: 0.95, el: 0.3, dist: 13.2, ty: 0.25, ox: 0.18, pan: 0, explode: 1, xray: 1, light: 'studio' },
  { id: 'towel', bg: 'water', fg: ['droplets', 'branch'], az: 0.55, el: -0.02, dist: 11.5, ty: -0.1, ox: -0.22, pan: 0.04, ripple: 1, light: 'warm' },
  { id: 'drawer', bg: 'structure', fg: [], az: 0.42, el: 0.04, dist: 8.4, ty: -0.35, ox: 0.18, pan: 0, drawer: 1, light: 'studio' },
  { id: 'ritual', bg: 'hero', fg: ['blinds', 'sprig', 'towel'], az: -0.5, el: 0.08, dist: 9.6, ty: 0.12, ox: 0.2, pan: 0.06, light: 'warm' },
  { id: 'texture', bg: 'texture', fg: ['fiber', 'bokeh'], az: 0.8, el: 0.12, dist: 12.5, ty: 0.1, ox: 0.28, pan: -0.05, fibers: 1, light: 'warm' },
  { id: 'closing', bg: 'closing', fg: ['bokeh'], az: 0.32, el: 0.16, dist: 13.0, ty: 1.0, ox: 0.0, pan: 0, halo: 1, light: 'gold' },
];

const LIGHTS = {
  warm: { key: [1.0, 0.9, 0.76], keyI: 1.7, rim: [0.75, 0.88, 1.0], rimI: 1.1, env: 0.42 },
  cool: { key: [0.92, 0.96, 1.0], keyI: 1.2, rim: [0.45, 0.85, 1.0], rimI: 2.2, env: 0.32 },
  studio: { key: [1.0, 0.99, 0.97], keyI: 1.6, rim: [0.7, 0.9, 1.0], rimI: 1.3, env: 0.5 },
  gold: { key: [1.0, 0.86, 0.66], keyI: 1.7, rim: [1.0, 0.9, 0.7], rimI: 1.6, env: 0.45 },
};

// Preliminary visual offsets in glTF metres (Y-up). Not engineering data.
const PARTS = [
  { name: 'FACE-TOWEL-ROTATING-COVERA_ASM__ASM', delta: [0, 0.07, 0] },
  { name: 'FACE-TOWEL-LCD_24', delta: [0, 0, 0.06] },
  { name: 'FACE-TOWEL-CAMERA-ASS_ASM_60_ASM', delta: [0, 0.04, 0.07] },
  { name: 'FACE-TOWEL-SLIDING-COVER-ASS_AS_ASM', delta: [0, 0, 0.09] },
  { name: 'HIGH-VOLTAGE-BOARD-PCBA_19', delta: [0.08, 0, 0] },
  { name: 'RAPID-HEAT-PIPE-BRACKET_ASM_60_ASM', delta: [-0.08, 0, 0] },
  { name: 'FACE-TOWEL-BOTTOM-COVER_ASM_27_ASM', delta: [0, -0.06, 0] },
];
// The display/front face is +Z in this GLB; these sibling sliding roots move together.
const DRAWER_PARTS = [
  { name: 'FACE-TOWEL-SLIDING-BOTTOM-CVASM_ASM', delta: [0, 0, 0.11] },
  { name: 'FACE-TOWEL-SLIDING-COVER-ASS_AS_ASM', delta: [0, 0, 0.11] },
];

const PRODUCT_HEIGHT = 2.5; // world units
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function classify(object) {
  let node = object;
  while (node) {
    const name = (node.name || '').toUpperCase();
    if (name.includes('WINDOW-PMMA')) return 'window';
    if (name.includes('PCBA') || name.includes('BOARD') || name.includes('PUMP') || name.includes('MOTOR') ||
      name.includes('VALVE') || name.includes('HEAT') || name.includes('PIPE') || name.includes('BRACKET') ||
      name.includes('BOTTLE') || name.includes('CYLINDER') || name.includes('SHAFT') || name.includes('JSB') ||
      name.includes('MANIFOLD') || name.includes('MAGNETIC') || name.includes('WATER-BLOCK') || name.includes('SHOWER')) return 'internal';
    if (name.includes('SILICONE') || name.includes('ILICONE') || name.includes('DUST-PROOF')) return 'silicone';
    if (name.startsWith('FACE-TOWEL-LCD_24')) return 'screen';
    if (name.includes('CAMERA')) return 'camera';
    if (name.includes('CASE') || name.includes('COVER') || name.includes('DECO') || name.includes('GAI') || name.includes('SLIDING')) return 'shell';
    node = node.parent;
  }
  return 'shell';
}

function canvasTexture(THREE, width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dotTexture(THREE) {
  return canvasTexture(THREE, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function contactShadowTexture(THREE) {
  return canvasTexture(THREE, 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(20,16,12,.85)');
    g.addColorStop(0.45, 'rgba(20,16,12,.35)');
    g.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

// Engraved circuit-line pattern seen on the long side of the real product.
function circuitTexture(THREE) {
  return canvasTexture(THREE, 1024, 860, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const groove = (points, offset) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h + offset) : ctx.moveTo(x * w, y * h + offset)));
      ctx.stroke();
    };
    const paths = [
      [[0.06, 0.04], [0.06, 0.6], [0.16, 0.72], [0.16, 0.98]],
      [[0.1, 0.04], [0.1, 0.56], [0.2, 0.68], [0.2, 0.98]],
      [[0.14, 0.04], [0.14, 0.5], [0.26, 0.64], [0.26, 0.98]],
      [[0.36, 0.0], [0.36, 0.3], [0.5, 0.46], [0.5, 0.98]],
      [[0.41, 0.0], [0.41, 0.27], [0.55, 0.43], [0.55, 0.98]],
      [[0.94, 0.12], [0.72, 0.38], [0.72, 0.62], [0.94, 0.88]],
      [[0.98, 0.18], [0.78, 0.4], [0.78, 0.6], [0.98, 0.82]],
      [[0.62, 0.0], [0.62, 0.18], [0.7, 0.26]],
    ];
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(70,72,74,.28)';
    paths.forEach((p) => groove(p, 0));
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    paths.forEach((p) => groove(p, 3));
  });
}

function wordmarkTexture(THREE, text) {
  return canvasTexture(THREE, 2400, 760, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(24,32,38,1)';
    ctx.font = '300 620px "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = [...text];
    const step = w / letters.length;
    letters.forEach((letter, i) => ctx.fillText(letter, step * (i + 0.5), h * 0.52));
  });
}

function makeGradeShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 0.32 },
      uGrain: { value: 0.035 },
      uWarm: { value: 0.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uWarm;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        col = mix(col, col*col*(3.0-2.0*col), 0.28);
        col *= mix(vec3(1.0), vec3(1.04,1.0,0.94), uWarm);
        vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * 3.2 * uVignette;
        col *= clamp(v, 0.0, 1.0);
        col += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
}

export async function createCinematicWorld({ canvas, onProgress = () => {}, onModelReady = () => {}, loadModel = true }) {
  const [THREE, { GLTFLoader }, { DRACOLoader }, { RoomEnvironment }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ]);

  const lowPower = window.innerWidth < 760 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 6) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setClearColor(0xefe9df, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 200);
  scene.add(camera);

  const keyLight = new THREE.DirectionalLight(0xfff1dc, 3.4);
  keyLight.position.set(-5, 7, 5);
  keyLight.castShadow = !lowPower;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xbfe4ff, 1.6);
  rimLight.position.set(5, 4, -6);
  scene.add(rimLight);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cbb8, 0.35));

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(total ? (loaded / total) * 0.6 : 0, '正在铺设清晨的光');
  const loader = new THREE.TextureLoader(manager);
  const load = async (file) => {
    try {
      const t = await loader.loadAsync(`./assets/${file}`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    } catch (error) {
      console.warn('Missing scene asset', file, error);
      return null;
    }
  };
  const bgTextures = {};
  const fgTextures = {};
  await Promise.all([
    ...Object.entries(BG_FILES).map(async ([key, file]) => { bgTextures[key] = await load(file); }),
    ...Object.entries(FG_LAYERS).map(async ([key, layer]) => { fgTextures[key] = await load(layer.file); }),
  ]);

  // Background plates: camera-attached far planes, cover-fit, cross-faded, slow pan.
  const BG_DISTANCE = 60;
  const bgMeshes = {};
  for (const [key, texture] of Object.entries(bgTextures)) {
    if (!texture) continue;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set(0, 0, -BG_DISTANCE);
    mesh.renderOrder = -100;
    mesh.frustumCulled = false;
    mesh.visible = false;
    camera.add(mesh);
    bgMeshes[key] = { mesh, material, aspect: texture.image.width / texture.image.height };
  }

  const fgMeshes = {};
  for (const [key, layer] of Object.entries(FG_LAYERS)) {
    const texture = fgTextures[key];
    if (!texture) continue;
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false,
      blending: layer.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const aspect = texture.image.width / texture.image.height;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), material);
    mesh.renderOrder = 50;
    mesh.frustumCulled = false;
    mesh.visible = false;
    camera.add(mesh);
    fgMeshes[key] = { mesh, material, layer };
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = -5;
  scene.add(ground);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.75, toneMapped: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = -4;
  scene.add(contact);

  const wordMaterial = new THREE.MeshBasicMaterial({ map: wordmarkTexture(THREE, '棉小柔'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const wordmark = new THREE.Mesh(new THREE.PlaneGeometry(2400 / 760, 1), wordMaterial);
  wordmark.renderOrder = -10;
  wordmark.visible = false;
  scene.add(wordmark);

  const dot = dotTexture(THREE);
  const particleCount = lowPower ? 60 : 220;
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (rand() - 0.5) * 9;
    positions[i * 3 + 1] = (rand() - 0.5) * 5.5;
    positions[i * 3 + 2] = -2.5 - rand() * 9;
    seeds[i] = rand();
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({ map: dot, size: 0.05, color: 0xfff1d8, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  camera.add(particles);

  const rig = new THREE.Group();
  scene.add(rig);
  const fx = new THREE.Group();
  rig.add(fx);

  const scanMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uProgress: { value: 0 }, uStrength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uProgress; uniform float uStrength;
      void main(){ float band=exp(-pow((vUv.y-uProgress)*30.0,2.0));
      float trail=smoothstep(uProgress-0.35,uProgress,vUv.y)*step(vUv.y,uProgress)*0.18;
      float edge=smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x);
      gl_FragColor=vec4(vec3(0.42,0.86,1.0)*(band*1.4+trail), (band+trail)*edge*uStrength); }`,
  });
  const scanBeam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scanMaterial);
  scanBeam.visible = false;
  scanBeam.renderOrder = 10;
  fx.add(scanBeam);

  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.012, 12, 180), haloMaterial);
  halo.visible = false;
  fx.add(halo);
  const ripples = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 128), new THREE.MeshBasicMaterial({ color: 0x9fe3f5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.userData.phase = i / 3;
    m.visible = false;
    fx.add(m);
    return m;
  });

  // Real project UI animation on the product screen
  const screenVideo = document.createElement('video');
  screenVideo.src = './assets/ui-state-demo.mp4';
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.preload = 'auto';
  const videoTexture = new THREE.VideoTexture(screenVideo);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  const posterTexture = await load('ui-detect.webp');
  const screenMaterial = new THREE.MeshBasicMaterial({ map: posterTexture || videoTexture, toneMapped: false, color: 0xd8d8d8 });
  let videoReady = false;
  screenVideo.addEventListener('loadeddata', () => { videoReady = true; screenMaterial.map = videoTexture; screenMaterial.needsUpdate = true; }, { once: true });

  let composer = null;
  let gradePass = null;
  let bloomPass = null;
  if (!lowPower) {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/ShaderPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
      ]);
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.45, 0.97);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      gradePass = new ShaderPass(makeGradeShader());
      composer.addPass(gradePass);
    } catch (error) {
      console.warn('Post-processing unavailable; rendering directly.', error);
      composer = null;
    }
  }

  let model = null;
  let modelReady = false;
  let modelPromise = null;
  let unit = 1;
  const shellMaterials = [];
  let internalMaterial = null;
  let partRecords = [];
  let drawerRecords = [];
  let screenPlane = null;
  const calloutNodes = [...document.querySelectorAll('[data-model-part]')];
  const calloutRoot = document.getElementById('structureCallouts');

  function buildMaterials() {
    internalMaterial = new THREE.MeshStandardMaterial({ color: 0xc9b48f, roughness: 0.35, metalness: 0.75, emissive: 0x3aa6c8, emissiveIntensity: 0 });
    return {
      shell: new THREE.MeshPhysicalMaterial({ color: 0xe6e3dd, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) }),
      camera: new THREE.MeshPhysicalMaterial({ color: 0xb8bcc0, roughness: 0.28, metalness: 0.65, clearcoat: 0.6 }),
      silicone: new THREE.MeshStandardMaterial({ color: 0xd9dbdc, roughness: 0.7 }),
      window: new THREE.MeshPhysicalMaterial({ color: 0xcfe6ef, roughness: 0.08, transparent: true, opacity: 0.75, clearcoat: 1 }),
      screen: new THREE.MeshPhysicalMaterial({ color: 0x15191c, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
      internal: internalMaterial,
    };
  }

  function loadModelAsset() {
    if (!loadModel) return Promise.resolve(false);
    if (modelReady) return Promise.resolve(true);
    if (modelPromise) return modelPromise;
    modelPromise = new Promise((resolve) => {
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(draco);
      gltfLoader.load('./assets/mxr-product.glb', (gltf) => {
        model = gltf.scene;
        const materials = buildMaterials();
        model.traverse((object) => {
          if (!object.isMesh) return;
          const kind = classify(object);
          object.material = kind === 'shell' ? materials.shell.clone() : materials[kind];
          if (kind === 'shell') shellMaterials.push(object.material);
          object.castShadow = kind === 'shell' || kind === 'camera';
          object.receiveShadow = kind === 'shell';
        });

        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        unit = PRODUCT_HEIGHT / Math.max(0.001, size.y);
        const pivot = new THREE.Group();
        pivot.scale.setScalar(unit);
        pivot.position.set(-center.x * unit, -bounds.min.y * unit, -center.z * unit);
        pivot.add(model);
        rig.add(pivot);
        rig.updateMatrixWorld(true);

        const lcd = model.getObjectByName('FACE-TOWEL-LCD_24');
        if (lcd) {
          const box = new THREE.Box3().setFromObject(lcd);
          const s = box.getSize(new THREE.Vector3());
          const c = box.getCenter(new THREE.Vector3());
          screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(s.x * 0.94, s.y * 0.94), screenMaterial);
          screenPlane.position.set(c.x, c.y, box.max.z + 0.004);
          scene.add(screenPlane);
          lcd.attach(screenPlane);
        }
        const caseNode = model.getObjectByName('FACE-TOWEL-CASE_444');
        const body = new THREE.Box3().setFromObject(caseNode || model);
        const bs = body.getSize(new THREE.Vector3());
        const decalMaterial = new THREE.MeshStandardMaterial({ map: circuitTexture(THREE), transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(bs.z * 0.92, bs.y * 0.82), decalMaterial);
        decal.rotation.y = Math.PI / 2;
        decal.position.set(body.max.x + 0.004, body.min.y + bs.y * 0.46, body.min.z + bs.z * 0.5);
        scene.add(decal);
        (caseNode || pivot).attach(decal);
        shellMaterials.push(decalMaterial);

        const productBox = new THREE.Box3().setFromObject(pivot);
        const ps = productBox.getSize(new THREE.Vector3());
        scanBeam.scale.set(ps.x * 1.25, ps.y * 1.05, 1);
        scanBeam.position.set(0, ps.y * 0.52, productBox.max.z + 0.05);
        halo.position.set(0, ps.y * 0.55, productBox.min.z - 0.6);
        contact.scale.set(ps.x * 2.6, ps.z * 1.6, 1);
        contact.position.set(0, 0.002, (productBox.min.z + productBox.max.z) / 2);

        const recordFor = (part) => {
          const object = part && model.getObjectByName(part.name);
          if (!object?.parent) return null;
          const worldDelta = new THREE.Vector3(...part.delta).multiplyScalar(unit);
          const origin = object.getWorldPosition(new THREE.Vector3());
          const a = object.parent.worldToLocal(origin.clone());
          const b = object.parent.worldToLocal(origin.clone().add(worldDelta));
          return { object, base: object.position.clone(), delta: b.sub(a) };
        };
        partRecords = PARTS.map(recordFor).filter(Boolean);
        drawerRecords = DRAWER_PARTS.map(recordFor).filter(Boolean);
        if (drawerRecords.length !== DRAWER_PARTS.length) {
          console.warn(`Drawer animation parts found ${drawerRecords.length}/${DRAWER_PARTS.length}`);
        }
        for (const element of calloutNodes) element._node = model.getObjectByName(element.dataset.modelPart) || null;
        modelReady = true;
        if (location.search.includes('debug')) {
          const box = new THREE.Box3().setFromObject(pivot);
          window.__mxr = { THREE, camera, rig, pivot, unit, rawSize: size.toArray(), worldSize: box.getSize(new THREE.Vector3()).toArray(), worldMin: box.min.toArray(), worldMax: box.max.toArray() };
        }
        onModelReady({ ok: true, foundParts: partRecords.length, expectedParts: PARTS.length });
        resolve(true);
      }, (event) => {
        if (event.total) onProgress(0.6 + (event.loaded / event.total) * 0.4, '正在载入产品三维模型');
      }, (error) => {
        console.warn('Product model unavailable', error);
        onModelReady({ ok: false });
        resolve(false);
      });
    });
    return modelPromise;
  }

  const numeric = ['az', 'el', 'dist', 'ty', 'ox', 'pan', 'word', 'scan', 'screen', 'explode', 'xray', 'ripple', 'drawer', 'fibers', 'halo'];
  function mix(index, progress) {
    const a = CHAPTERS[index];
    const b = CHAPTERS[Math.min(index + 1, CHAPTERS.length - 1)];
    const travel = index === CHAPTERS.length - 1 ? 0 : ease(smoothstep(0.5, 1, progress));
    const out = { a, b, travel };
    for (const key of numeric) out[key] = lerp(a[key] || 0, b[key] || 0, travel);
    const la = LIGHTS[a.light];
    const lb = LIGHTS[b.light];
    out.light = {
      key: la.key.map((v, i) => lerp(v, lb.key[i], travel)), keyI: lerp(la.keyI, lb.keyI, travel),
      rim: la.rim.map((v, i) => lerp(v, lb.rim[i], travel)), rimI: lerp(la.rimI, lb.rimI, travel), env: lerp(la.env, lb.env, travel),
    };
    return out;
  }

  const target = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const smoothPos = new THREE.Vector3(0, 1.5, 9);
  const smoothTarget = new THREE.Vector3(0, 1.2, 0);
  const tmp = new THREE.Vector3();
  let smoothOx = 0;
  let firstFrame = true;
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;

  function fitPlate(entry, panX) {
    const h = 2 * BG_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const cover = 1.5;
    let pw = w * cover;
    let ph = pw / entry.aspect;
    if (ph < h * 1.15) { ph = h * 1.15; pw = ph * entry.aspect; }
    entry.mesh.scale.set(pw, ph, 1);
    entry.mesh.position.x = panX * w;
  }

  function updateCallouts(state, explodeAmount) {
    if (!calloutRoot) return;
    const visible = modelReady && state.scene === 'structure' && explodeAmount > 0.35;
    calloutRoot.classList.toggle('is-visible', visible);
    if (!visible) return;
    for (const element of calloutNodes) {
      const node = element._node;
      if (!node) { element.hidden = true; continue; }
      const p = node.getWorldPosition(tmp).project(camera);
      const outside = p.z > 1 || Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.94;
      element.hidden = outside;
      if (!outside) {
        element.style.setProperty('--anchor-x', `${(p.x * 0.5 + 0.5) * viewW}px`);
        element.style.setProperty('--anchor-y', `${(-p.y * 0.5 + 0.5) * viewH}px`);
      }
    }
  }

  let time = 0;

  function update(state, deltaSeconds = 1 / 60, options = {}) {
    if (!state) return;
    const { ambient = true, pointerX = 0, pointerY = 0, reducedMotion = false } = options;
    const live = ambient && !reducedMotion;
    time += live ? deltaSeconds : 0;
    const index = clamp(Math.round(state.index), 0, CHAPTERS.length - 1);
    const progress = clamp(state.progress, 0, 1);
    const p = mix(index, progress);
    const sceneId = CHAPTERS[index].id;

    const dolly = 1 - 0.07 * smoothstep(0, 0.6, progress) * (1 - p.travel);
    const az = p.az + (live ? pointerX * 0.06 : 0);
    const el = p.el + (live ? -pointerY * 0.03 : 0);
    target.set(0, PRODUCT_HEIGHT * 0.5 + p.ty, 0);
    camPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(p.dist * dolly).add(target);
    const k = firstFrame || !live ? 1 : 1 - Math.exp(-Math.min(0.1, deltaSeconds) * 6);
    smoothPos.lerp(camPos, k);
    smoothTarget.lerp(target, k);
    smoothOx = lerp(smoothOx, viewW < 760 ? 0 : p.ox, k);
    firstFrame = false;
    camera.position.copy(smoothPos);
    camera.lookAt(smoothTarget);
    camera.setViewOffset(viewW, viewH, -smoothOx * viewW * 0.5, 0, viewW, viewH);
    camera.updateMatrixWorld(true);

    keyLight.color.setRGB(...p.light.key);
    keyLight.intensity = p.light.keyI;
    rimLight.color.setRGB(...p.light.rim);
    rimLight.intensity = p.light.rimI;
    scene.environmentIntensity = p.light.env;

    const pan = p.pan * (progress - 0.5) * 2;
    for (const [key, entry] of Object.entries(bgMeshes)) {
      const isA = key === p.a.bg;
      const isB = key === p.b.bg;
      entry.mesh.visible = isA || (isB && p.travel > 0.001);
      if (!entry.mesh.visible) continue;
      entry.material.opacity = isA ? 1 : p.travel;
      entry.mesh.renderOrder = isA ? -101 : -100;
      fitPlate(entry, pan);
    }

    const halfH = (d) => d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const [key, entry] of Object.entries(fgMeshes)) {
      const w = (p.a.fg.includes(key) ? 1 - p.travel : 0) + (p.b.fg.includes(key) ? p.travel : 0);
      entry.mesh.visible = w > 0.001;
      if (!entry.mesh.visible) continue;
      const { layer } = entry;
      const hh = halfH(layer.d);
      const hw = hh * camera.aspect;
      const drift = layer.drift * (progress - 0.5) * 0.5 + (live ? Math.sin(time * 0.4 + layer.d) * 0.01 : 0);
      entry.mesh.position.set((layer.x + drift) * hw, layer.y * hh + (progress - 0.5) * layer.drift * -0.2 * hh, -layer.d);
      entry.mesh.scale.setScalar(layer.h * 2 * hh);
      entry.material.opacity = layer.opacity * w;
    }

    wordmark.visible = p.word > 0.002;
    if (wordmark.visible) {
      tmp.subVectors(smoothTarget, camera.position).setY(0).normalize();
      wordmark.position.copy(smoothTarget).addScaledVector(tmp, 3.4);
      wordmark.position.y = PRODUCT_HEIGHT * 0.68;
      wordmark.quaternion.copy(camera.quaternion);
      wordmark.scale.setScalar(3.1);
      wordMaterial.opacity = 0.92 * p.word;
    }

    rig.rotation.y = live ? Math.sin(time * 0.25) * 0.02 : 0;

    if (modelReady) {
      if (videoReady && screenVideo.duration) {
        const local = sceneId === 'scan' ? progress * 0.55 : sceneId === 'result' ? 0.55 + progress * 0.45 : 0.98;
        const t = Math.min(screenVideo.duration - 0.05, local * screenVideo.duration);
        if (Math.abs(screenVideo.currentTime - t) > 0.06 && !screenVideo.seeking) screenVideo.currentTime = t;
      }
      if (screenPlane) screenPlane.material.color.setScalar(0.78 + p.screen * 0.12);

      const explodeAmount = sceneId === 'structure' ? smoothstep(0.04, 0.4, progress) * (1 - smoothstep(0.72, 0.96, progress)) : 0;
      for (const r of partRecords) r.object.position.copy(r.base).addScaledVector(r.delta, explodeAmount);
      const drawerAmount = sceneId === 'drawer' ? smoothstep(0.06, 0.42, progress) * (1 - smoothstep(0.8, 0.98, progress)) : 0;
      for (const r of drawerRecords) {
        r.object.position.copy(r.base).addScaledVector(r.delta, drawerAmount);
      }
      const opacity = 1 - explodeAmount * 0.9;
      for (const m of shellMaterials) {
        m.transparent = opacity < 0.995 || Boolean(m.map);
        m.opacity = opacity;
        m.depthWrite = opacity > 0.99 && !m.map;
      }
      if (internalMaterial) internalMaterial.emissiveIntensity = explodeAmount * 0.9;
      for (const m of shellMaterials) if (m.color && !m.map) m.color.setRGB(lerp(0.9, 0.62, explodeAmount), lerp(0.89, 0.84, explodeAmount), lerp(0.866, 0.95, explodeAmount));
      updateCallouts({ scene: sceneId }, explodeAmount);
    }

    scanBeam.visible = p.scan > 0.01 || p.screen > 0.01;
    scanMaterial.uniforms.uProgress.value = sceneId === 'scan' ? (progress * 1.6) % 1.15 : (time * 0.25) % 1.15;
    scanMaterial.uniforms.uStrength.value = Math.max(p.scan * 0.55, p.screen * 0.2);

    ripples.forEach((ring) => {
      ring.visible = p.ripple > 0.01;
      if (!ring.visible) return;
      const phase = ((live ? time * 0.18 : 0.3) + ring.userData.phase) % 1;
      const r = 1.2 + phase * 3.4;
      ring.scale.set(r, r, r);
      ring.position.y = 0.01;
      ring.material.opacity = p.ripple * 0.5 * (1 - phase);
    });
    halo.visible = p.halo > 0.01;
    if (halo.visible) {
      haloMaterial.opacity = p.halo * 0.85;
      halo.lookAt(camera.position);
      halo.rotateZ(time * 0.05);
    }

    const pos = particleGeometry.attributes.position.array;
    if (live) {
      for (let i = 0; i < particleCount; i += 1) {
        const sd = seeds[i];
        pos[i * 3 + 1] += deltaSeconds * (p.ripple > 0.5 ? -0.5 - sd * 0.6 : 0.03 + sd * 0.05);
        pos[i * 3] += deltaSeconds * Math.sin(time * 0.3 + sd * 6) * 0.03;
        if (pos[i * 3 + 1] > 2.9) pos[i * 3 + 1] = -2.9;
        if (pos[i * 3 + 1] < -2.9) pos[i * 3 + 1] = 2.9;
      }
      particleGeometry.attributes.position.needsUpdate = true;
    }
    const cool = Math.max(p.scan, p.screen * 0.6, p.ripple);
    particleMaterial.color.setRGB(lerp(1, 0.75, cool), lerp(0.95, 0.93, cool), lerp(0.85, 1, cool));
    particleMaterial.size = 0.04 + p.fibers * 0.04 + p.ripple * 0.02;
    particleMaterial.opacity = 0.55 + p.fibers * 0.3;

    if (gradePass) {
      gradePass.uniforms.uTime.value = time * 60;
      gradePass.uniforms.uWarm.value = 0.6 * (1 - Math.max(p.scan, p.screen));
      gradePass.uniforms.uVignette.value = 0.3 + p.scan * 0.15;
    }
    if (bloomPass) bloomPass.strength = 0.14 + p.halo * 0.22 + p.scan * 0.1;

    if (composer) composer.render(deltaSeconds);
    else renderer.render(scene, camera);
  }

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / Math.max(1, viewH);
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(viewW, viewH);
    }
  }
  resize();
  onProgress(0.6, '场景已就绪');

  return {
    update,
    resize,
    loadModelAsset,
    get modelReady() { return modelReady; },
    dispose() {
      screenVideo.pause();
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
