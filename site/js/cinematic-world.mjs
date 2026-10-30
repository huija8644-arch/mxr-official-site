import { clamp, smoothstep } from './scroll-timeline.mjs';

const STAGES = [
  { id: 'intro', background: 'morning-vanity.webp', mood: 'dawn', layers: ['foreground-01.webp', 'foreground-02.webp', 'foreground-03.webp', 'foreground-04.webp', 'foreground-10.webp'], camera: [-0.45, 0.28, 8.0], look: [1.9, 0.0, 0], model: [1.9, -0.02, 0], yaw: -0.2, scale: 1.0 },
  { id: 'scan', background: 'warmwhite-stage.webp', mood: 'scan', layers: ['foreground-07.webp', 'foreground-10.webp'], camera: [0.2, 0.18, 5.5], look: [1.9, 0.05, 0], model: [1.9, 0, 0], yaw: 0.02, scale: 1.02 },
  { id: 'result', background: 'warmwhite-stage.webp', mood: 'result', layers: ['foreground-08.webp', 'foreground-10.webp'], camera: [2.7, 0.35, 5.25], look: [1.9, 0.12, 0], model: [1.9, 0.02, 0], yaw: 0.14, scale: 1.03 },
  { id: 'structure', background: 'warmwhite-stage.webp', mood: 'structure', layers: ['foreground-04.webp', 'foreground-08.webp'], camera: [-1.05, 0.5, 7.4], look: [1.9, 0.0, 0], model: [1.9, 0, 0], yaw: 0.3, scale: 1.03 },
  { id: 'towel', background: 'warmwhite-stage.webp', mood: 'water', layers: ['foreground-05.webp', 'foreground-06.webp', 'foreground-07.webp', 'foreground-08.webp', 'foreground-09.webp'], camera: [0.9, -0.58, 6.2], look: [1.9, -0.38, 0], model: [1.9, -0.06, 0], yaw: 0.08, scale: 0.96 },
  { id: 'drawer', background: 'warmwhite-stage.webp', mood: 'drawer', layers: ['foreground-04.webp', 'foreground-05.webp', 'foreground-07.webp'], camera: [0.2, -0.55, 4.8], look: [1.95, -0.55, 0], model: [1.9, -0.02, 0], yaw: 0.05, scale: 1.04 },
  { id: 'ritual', background: 'morning-vanity.webp', mood: 'dawn', layers: ['foreground-01.webp', 'foreground-02.webp', 'foreground-03.webp', 'foreground-04.webp', 'foreground-05.webp', 'foreground-10.webp'], camera: [-0.7, 0.34, 7.8], look: [1.9, 0.0, 0], model: [1.9, 0, 0], yaw: -0.18, scale: 0.98 },
  { id: 'texture', background: 'warmwhite-stage.webp', mood: 'fiber', layers: ['foreground-05.webp', 'foreground-08.webp', 'foreground-10.webp'], camera: [1.2, 0.16, 5.15], look: [1.9, 0.08, 0], model: [1.9, 0.02, 0], yaw: 0.17, scale: 1.0 },
  { id: 'closing', background: 'warmwhite-stage.webp', mood: 'halo', layers: ['foreground-04.webp', 'foreground-09.webp', 'foreground-10.webp'], camera: [-0.35, 0.42, 8.2], look: [1.9, 0.0, 0], model: [1.9, -0.02, 0], yaw: 0.02, scale: 1.0 },
];

const LAYER_POSE = {
  'foreground-01.webp': [-4.25, 0.2, 1.15, 7.2, 0.72],
  'foreground-02.webp': [4.2, 1.35, 0.75, 4.7, 0.64],
  'foreground-03.webp': [4.35, -1.15, 1.45, 2.4, 0.58],
  'foreground-04.webp': [0.2, -2.35, 1.25, 4.7, 0.5],
  'foreground-05.webp': [3.0, -1.0, 1.55, 2.0, 0.68],
  'foreground-06.webp': [3.65, 0.5, 1.3, 1.65, 0.7],
  'foreground-07.webp': [-3.55, 1.05, 1.25, 1.9, 0.62],
  'foreground-08.webp': [2.7, 0.9, 1.7, 3.4, 0.48],
  'foreground-09.webp': [3.75, -1.55, 1.4, 2.25, 0.53],
  'foreground-10.webp': [-1.15, 1.85, -1.5, 6.0, 0.52],
};

// CSV values are preliminary visual offsets. Blender Z-up is mapped to Three.js Y-up;
// this animation is not a verified assembly, hinge axis, or operating stroke.
const PARTS = [
  { name: 'FACE-TOWEL-ROTATING-COVERA_ASM__ASM', delta: [0, 0.045, 0] },
  { name: 'FACE-TOWEL-LCD_24', delta: [0, 0, 0.040] },
  { name: 'FACE-TOWEL-CAMERA-ASS_ASM_60_ASM', delta: [0, 0, 0.055] },
  { name: 'FACE-TOWEL-SLIDING-COVER-ASS_AS_ASM', delta: [0, 0, 0.065] },
  { name: 'FACE-TOWEL-SLIDING-BOTTOM-CVASM_ASM', delta: [0, 0, 0.085] },
  { name: 'HIGH-VOLTAGE-BOARD-PCBA_19', delta: [0.050, 0, 0] },
  { name: 'RAPID-HEAT-PIPE-BRACKET_ASM_60_ASM', delta: [-0.055, 0, 0] },
  { name: 'FACE-TOWEL-BOTTOM-COVER_ASM_27_ASM', delta: [0, -0.055, 0] },
];

const STAGE_SPACING = 6.6;
const clamp01 = (value) => clamp(value, 0, 1);

function makeDotTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,.86)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addTracked(stage, object, opacity) {
  const material = object.material;
  if (material) {
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = opacity;
    stage.faders.push({ material, opacity });
  }
  stage.root.add(object);
  return object;
}

function imagePlane(THREE, texture, pose) {
  if (!texture) return null;
  const [x, y, z, height, opacity] = pose;
  const aspect = (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1);
  const geometry = new THREE.PlaneGeometry(aspect, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    alphaTest: 0.015,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(height, height, 1);
  mesh.renderOrder = z > 0 ? 4 : -4;
  return mesh;
}

function makeParticles(THREE, stage, dotTexture, count, color, seedValue, size) {
  const random = seeded(seedValue);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 8.8;
    positions[i * 3 + 1] = (random() - 0.5) * 5.0;
    positions[i * 3 + 2] = (random() - 0.5) * 2.8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    map: dotTexture,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    alphaTest: 0.025,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.position.set(0, 0, 0.35);
  addTracked(stage, points, 0.55);
  stage.rotors.push({ object: points, rate: 0.012 + random() * 0.012 });
}

function addLine(stage, THREE, points, color, opacity, radius = 0.006) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const geometry = new THREE.TubeGeometry(curve, 48, radius, 5, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  return addTracked(stage, new THREE.Mesh(geometry, material), opacity);
}

function createScanBeam(THREE, stage) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uProgress: { value: 0 }, uStrength: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uProgress;
      uniform float uStrength;
      void main(){
        float band=exp(-pow((vUv.y-uProgress)*34.0,2.0));
        float halo=exp(-pow((vUv.y-uProgress)*7.0,2.0))*0.18;
        float edge=smoothstep(0.0,0.18,vUv.x)*smoothstep(1.0,0.82,vUv.x);
        float alpha=(band*0.34+halo)*edge*uStrength;
        gl_FragColor=vec4(0.36,0.78,0.97,alpha);
      }`,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.9), material);
  beam.position.set(1.9, 0.05, 0.66);
  addTracked(stage, beam, 1);
  stage.scan = beam;
}

function createRing(THREE, stage, radius, color, opacity, y, horizontal = false) {
  const geometry = new THREE.TorusGeometry(radius, 0.012, 8, 112);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(geometry, material);
  ring.position.set(1.9, y, -0.5);
  if (horizontal) ring.rotation.x = Math.PI / 2;
  addTracked(stage, ring, opacity);
  stage.rings.push(ring);
  return ring;
}

function makeWindowFrame(THREE, stage) {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(4.5, 4.9, 0.045));
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
  const frame = new THREE.LineSegments(geometry, material);
  frame.position.set(-2.05, 0.25, -3.2);
  addTracked(stage, frame, 0.4);
  const barMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, depthWrite: false });
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.022, 4.85, 0.02), barMaterial);
  vertical.position.set(-2.05, 0.25, -3.16);
  addTracked(stage, vertical, 0.24);
  const horizontalMaterial = barMaterial.clone();
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.022, 0.02), horizontalMaterial);
  horizontal.position.set(-2.05, 0.25, -3.16);
  addTracked(stage, horizontal, 0.24);
}

function createStage(THREE, definition, index, textures, dotTexture, particleCount) {
  const stage = { id: definition.id, definition, index, root: new THREE.Group(), faders: [], rotors: [], rings: [], scan: null, weight: 0 };
  stage.root.position.x = index * STAGE_SPACING;
  stage.root.visible = false;
  const backgroundTexture = textures[definition.background];
  const aspect = (backgroundTexture?.image?.width || 16) / Math.max(1, backgroundTexture?.image?.height || 9);
  const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: backgroundTexture || null,
    color: backgroundTexture ? 0xffffff : (definition.mood === 'dawn' ? 0xf6f1e7 : 0xf1f5f5),
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const background = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), backgroundMaterial);
  background.scale.set(14.2, 14.2, 1);
  background.position.set(0, 0.05, -8.6);
  background.renderOrder = -10;
  addTracked(stage, background, 1);

  const floorMaterial = new THREE.MeshBasicMaterial({ color: definition.mood === 'scan' ? 0xe9f6fb : 0xf1ede4, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 6), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.78, -0.3);
  addTracked(stage, floor, 0.18);

  for (const file of definition.layers) {
    const pose = LAYER_POSE[file];
    const mesh = imagePlane(THREE, textures[file], pose);
    if (mesh) addTracked(stage, mesh, pose[4]);
  }

  if (definition.mood === 'dawn') makeWindowFrame(THREE, stage);
  const accent = definition.mood === 'scan' || definition.mood === 'result' ? 0x91d9f1 : 0xb9d9e5;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(definition.mood === 'halo' ? 1.9 : 1.55, definition.mood === 'halo' ? 0.018 : 0.01, 8, 128),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: definition.mood === 'halo' ? 0.42 : 0.24, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.position.set(1.9, 0.05, -1.1);
  addTracked(stage, halo, definition.mood === 'halo' ? 0.42 : 0.24);
  stage.rotors.push({ object: halo, rate: definition.mood === 'scan' ? 0.045 : 0.012 });

  if (definition.mood === 'scan' || definition.mood === 'result') createScanBeam(THREE, stage);

  if (definition.mood === 'structure') {
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x8bb6c9, wireframe: true, transparent: true, opacity: 0.14, depthWrite: false });
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(2.05, 1), wireMaterial);
    cage.position.set(1.9, 0.1, -1.15);
    addTracked(stage, cage, 0.14);
    stage.rotors.push({ object: cage, rate: 0.018 });
  }

  if (definition.mood === 'water' || definition.mood === 'drawer') {
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      createRing(THREE, stage, 0.62 + ringIndex * 0.5, ringIndex === 0 ? 0x8fdaf0 : 0xb9e6ee, 0.26 - ringIndex * 0.045, -1.58 + ringIndex * 0.006, true);
    }
    addLine(stage, THREE, [[-2.5, -0.8, 1.4], [-1.5, -0.25, 1.6], [0.2, -0.05, 1.4], [1.2, 0.15, 1.1]], 0xc2ebef, 0.23, 0.007);
  }

  if (definition.mood === 'fiber') {
    addLine(stage, THREE, [[-1.4, -0.4, 0.7], [-0.6, 0.35, 1.0], [0.2, 0.15, 0.9], [1.1, 0.65, 1.25], [2.2, 0.4, 1.0]], 0xf6e4cb, 0.5, 0.009);
    addLine(stage, THREE, [[-1.5, 0.8, -0.2], [-0.35, 0.45, 0.35], [0.5, -0.05, 0.2], [1.4, 0.18, 0.75], [2.5, 0.92, 0.4]], 0xc8e8ee, 0.42, 0.006);
  }

  if (definition.mood === 'halo') {
    const plinthMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f0e7, transparent: true, opacity: 0.72, depthWrite: false });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.18, 72), plinthMaterial);
    plinth.position.set(1.9, -1.62, -0.05);
    addTracked(stage, plinth, 0.72);
  }

  makeParticles(THREE, stage, dotTexture, particleCount, definition.mood === 'water' || definition.mood === 'scan' ? 0xc5f0ff : 0xfff6e8, 913 + index * 71, definition.mood === 'water' ? 0.085 : 0.065);
  return stage;
}

function mapPosition(THREE, definition, index, key) {
  const point = definition[key];
  return new THREE.Vector3(point[0] + index * STAGE_SPACING, point[1], point[2]);
}

export async function createCinematicWorld({ canvas, onProgress = () => {}, onModelReady = () => {}, loadModel = true }) {
  const [{ default: _unused, ...THREE }, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
  ]);

  const lowPower = window.innerWidth < 760 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 6) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xf6f4ef, 0.0045);
  const camera = new THREE.PerspectiveCamera(38, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 0.1, 100);
  const hemi = new THREE.HemisphereLight(0xf8fbff, 0xb8b8aa, 2.0);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xfff7e9, 2.25);
  keyLight.position.set(-3.5, 5.5, 5.0);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9bdcf2, 1.4);
  rimLight.position.set(2.5, 2.8, -2.8);
  scene.add(rimLight);
  const fillLight = new THREE.DirectionalLight(0xffe4d0, 0.55);
  fillLight.position.set(3, -1.5, 4.5);
  scene.add(fillLight);

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(total > 0 ? loaded / total : 0, '正在准备场景图层');
  const textureLoader = new THREE.TextureLoader(manager);
  const filenames = [...new Set([...STAGES.map((stage) => stage.background), ...Object.keys(LAYER_POSE)])];
  const textures = {};
  await Promise.all(filenames.map(async (file) => {
    try {
      const texture = await textureLoader.loadAsync(`./assets/${file}`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures[file] = texture;
    } catch (error) {
      console.warn(`Scene layer unavailable: ${file}`, error);
      textures[file] = null;
    }
  }));

  const dotTexture = makeDotTexture(THREE);
  const particleCount = lowPower ? 16 : 44;
  const stageInstances = STAGES.map((definition, index) => createStage(THREE, definition, index, textures, dotTexture, particleCount));
  stageInstances.forEach((stage) => scene.add(stage.root));

  const cameraPoints = STAGES.map((definition, index) => mapPosition(THREE, definition, index, 'camera'));
  const lookPoints = STAGES.map((definition, index) => mapPosition(THREE, definition, index, 'look'));
  const modelPoints = STAGES.map((definition, index) => mapPosition(THREE, definition, index, 'model'));
  const cameraPath = new THREE.CatmullRomCurve3(cameraPoints, false, 'centripetal', 0.45);
  const lookPath = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal', 0.45);
  const modelPath = new THREE.CatmullRomCurve3(modelPoints, false, 'centripetal', 0.45);
  const cameraNow = cameraPoints[0].clone();
  const lookNow = lookPoints[0].clone();
  camera.position.copy(cameraNow);
  camera.lookAt(lookNow);

  let productRig = null;
  let model = null;
  let baseScale = 1;
  let modelReady = false;
  let modelLoadPromise = null;
  let explosionRecords = [];
  let drawerRecord = null;
  const calloutNodes = [...document.querySelectorAll('[data-model-part]')];
  const calloutRoot = document.getElementById('structureCallouts');

  function preparePartMotion() {
    if (!model || !productRig) return;
    model.updateMatrixWorld(true);
    productRig.updateMatrixWorld(true);
    const resolve = (part) => {
      const object = model.getObjectByName(part.name);
      if (!object?.parent) return null;
      const parent = object.parent;
      const base = object.position.clone();
      const worldOrigin = object.getWorldPosition(new THREE.Vector3());
      const worldDelta = new THREE.Vector3(...part.delta).multiplyScalar(baseScale);
      const localBase = parent.worldToLocal(worldOrigin.clone());
      const localTarget = parent.worldToLocal(worldOrigin.clone().add(worldDelta));
      return { object, base, delta: localTarget.sub(localBase) };
    };
    explosionRecords = PARTS.map(resolve).filter(Boolean);
    drawerRecord = resolve(PARTS.find((part) => part.name === 'FACE-TOWEL-SLIDING-BOTTOM-CVASM_ASM'));
    for (const element of calloutNodes) {
      element._modelNode = model.getObjectByName(element.dataset.modelPart) || null;
    }
  }

  function loadModelAsset() {
    if (!loadModel) return Promise.resolve(false);
    if (modelReady) return Promise.resolve(true);
    if (modelLoadPromise) return modelLoadPromise;
    modelLoadPromise = new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('./assets/mxr-test-export.glb', (gltf) => {
        model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z, 0.01);
        baseScale = 3.0 / largestDimension;
        model.position.sub(center);
        model.scale.setScalar(baseScale);
        productRig = new THREE.Group();
        productRig.add(model);
        scene.add(productRig);
        preparePartMotion();
        modelReady = true;
        onModelReady({ ok: true, foundParts: explosionRecords.length, expectedParts: PARTS.length });
        resolve(true);
      }, (event) => {
        if (event.total > 0) onProgress(event.loaded / event.total, '正在载入产品三维模型');
      }, (error) => {
        console.warn('Product GLB unavailable; continue with the static product image.', error);
        onModelReady({ ok: false, foundParts: 0, expectedParts: PARTS.length });
        resolve(false);
      });
    });
    return modelLoadPromise;
  }

  function setStageWeights(index, progress) {
    const blend = smoothstep(0.72, 0.99, progress);
    for (const stage of stageInstances) {
      const weight = stage.index === index ? 1 - blend : (stage.index === index + 1 ? blend : 0);
      stage.weight = weight;
      stage.root.visible = weight > 0.002;
      for (const entry of stage.faders) entry.material.opacity = entry.opacity * weight;
    }
  }

  function updateCallouts(state) {
    const visible = Boolean(modelReady && state.scene === 'structure');
    if (!calloutRoot) return;
    calloutRoot.classList.toggle('is-visible', visible);
    if (!visible) return;
    camera.updateMatrixWorld(true);
    productRig.updateMatrixWorld(true);
    for (const element of calloutNodes) {
      const object = element._modelNode;
      if (!object) {
        element.hidden = true;
        continue;
      }
      const position = object.getWorldPosition(new THREE.Vector3());
      position.project(camera);
      const outside = position.z < -1 || position.z > 1 || position.x < -0.98 || position.x > 0.98 || position.y < -0.95 || position.y > 0.95;
      element.hidden = outside;
      if (!outside) {
        element.style.setProperty('--anchor-x', `${(position.x * 0.5 + 0.5) * window.innerWidth}px`);
        element.style.setProperty('--anchor-y', `${(-position.y * 0.5 + 0.5) * window.innerHeight}px`);
      }
    }
  }

  function update(state, deltaSeconds, { ambient = true, pointerX = 0, pointerY = 0, reducedMotion = false } = {}) {
    if (!state) return;
    const index = clamp(Math.round(state.index), 0, STAGES.length - 1);
    const progress = clamp01(state.progress);
    const journey = clamp01(state.journey);
    setStageWeights(index, progress);

    const cameraTarget = cameraPath.getPointAt(journey);
    const lookTarget = lookPath.getPointAt(journey);
    if (ambient && !reducedMotion) {
      lookTarget.x += clamp(pointerX, -1, 1) * 0.11;
      lookTarget.y -= clamp(pointerY, -1, 1) * 0.07;
    }
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-Math.min(0.1, Math.max(0.001, deltaSeconds)) * 4.8);
    cameraNow.lerp(cameraTarget, smoothing);
    lookNow.lerp(lookTarget, smoothing);
    camera.position.copy(cameraNow);
    camera.lookAt(lookNow);

    const current = STAGES[index];
    const next = STAGES[Math.min(index + 1, STAGES.length - 1)];
    const blend = progress;
    const yaw = current.yaw + (next.yaw - current.yaw) * blend;
    const scale = current.scale + (next.scale - current.scale) * blend;
    if (productRig) {
      productRig.position.copy(modelPath.getPointAt(journey));
      productRig.scale.setScalar(scale);
      productRig.rotation.y = yaw + (ambient && !reducedMotion ? Math.sin(performance.now() * 0.00018) * 0.012 : 0);
      productRig.updateMatrixWorld(true);
    }

    const activeStage = stageInstances[index];
    if (activeStage?.scan) {
      const scanAmount = index === 1 ? 1 : (index === 2 ? 0.38 : 0);
      activeStage.scan.material.uniforms.uProgress.value = index === 1 ? progress : 0.82;
      activeStage.scan.material.uniforms.uStrength.value = scanAmount * (ambient && !reducedMotion ? 0.8 + Math.sin(performance.now() * 0.002) * 0.12 : 0.68);
    }
    if (productRig && explosionRecords.length) {
      let amount = 0;
      if (state.scene === 'structure') amount = progress < 0.66 ? smoothstep(0.08, 0.54, progress) : 1 - smoothstep(0.72, 0.98, progress);
      for (const item of explosionRecords) item.object.position.copy(item.base).addScaledVector(item.delta, amount * 0.86);
      if (state.scene === 'drawer' && drawerRecord) {
        const drawerAmount = smoothstep(0.12, 0.5, progress) * (1 - smoothstep(0.74, 0.98, progress));
        drawerRecord.object.position.copy(drawerRecord.base).addScaledVector(drawerRecord.delta, drawerAmount * 0.86);
      }
    }

    for (const stage of stageInstances) {
      if (stage.weight <= 0) continue;
      for (const rotor of stage.rotors) {
        if (ambient && !reducedMotion) rotor.object.rotation.z += deltaSeconds * rotor.rate;
      }
      if (stage.rings.length) {
        stage.rings.forEach((ring, ringIndex) => {
          const pulse = ambient && !reducedMotion ? (performance.now() * 0.00022 + ringIndex * 0.32) % 1 : 0.42;
          const size = 0.82 + pulse * 0.48;
          ring.scale.set(size, size, size);
          ring.material.opacity = (0.24 - ringIndex * 0.045) * stage.weight * (1 - pulse * 0.62);
        });
      }
    }

    if (state.scene === 'scan' || state.scene === 'result') {
      rimLight.intensity = 1.65;
      rimLight.color.setHex(0x91d9f1);
    } else {
      rimLight.intensity = 1.2;
      rimLight.color.setHex(0xb8d8e4);
    }
    updateCallouts(state);
    renderer.render(scene, camera);
  }

  function resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const currentLowPower = width < 760 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 6);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentLowPower ? 1.0 : 1.4));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    renderer.dispose();
    textures && Object.values(textures).forEach((texture) => texture?.dispose());
    dotTexture.dispose();
  }

  resize();
  onProgress(0.78, '空间场景已就位，正在准备产品结构');
  return { update, resize, dispose, loadModelAsset, get hasModel() { return modelReady; }, get expectedParts() { return PARTS.length; } };
}
