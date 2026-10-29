const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chapters = [...document.querySelectorAll('.chapter')];
const videos = [...document.querySelectorAll('video[data-scrub]')];
const world = document.getElementById('world');
const canvas = document.getElementById('worldCanvas');
const loader = document.getElementById('loadingNote');
const loaderText = document.getElementById('loadingText');
const loaderBar = document.getElementById('loadingBar');
const progressFill = document.getElementById('progressFill');
const motionToggle = document.getElementById('motionToggle');
let activeChapter = chapters[0];
let motionPaused = reducedMotion;
let scrollQueued = false;

if (reducedMotion) {
  document.documentElement.classList.add('motion-paused');
  motionToggle?.setAttribute('aria-pressed', 'true');
  if (motionToggle) motionToggle.textContent = '开启动态';
}

function sectionProgress(section) {
  if (!section) return 0;
  const rect = section.getBoundingClientRect();
  const height = Math.max(1, rect.height);
  return clamp((window.innerHeight - rect.top) / height - 1);
}

function chooseActiveChapter() {
  const focus = window.innerHeight * 0.48;
  let best = chapters[0];
  let bestDistance = Infinity;
  for (const section of chapters) {
    const rect = section.getBoundingClientRect();
    const center = rect.top + rect.height * 0.5;
    const distance = Math.abs(center - focus);
    if (distance < bestDistance) { best = section; bestDistance = distance; }
  }
  if (best !== activeChapter) {
    activeChapter = best;
    document.body.dataset.scene = best.dataset.scene || 'warm';
    document.querySelectorAll('.topnav a').forEach((link) => {
      const current = link.hash === `#${best.id}`;
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const linkedVideo = best.querySelector('video[data-scrub]');
    if (linkedVideo && linkedVideo.readyState === HTMLMediaElement.HAVE_NOTHING) linkedVideo.load();
  }
}

function updateVideos() {
  for (const video of videos) {
    const owner = video.closest('.chapter');
    if (owner !== activeChapter || video.dataset.userPlaying === 'true') continue;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < HTMLMediaElement.HAVE_METADATA) continue;
    const target = sectionProgress(owner) * video.duration;
    if (Math.abs(video.currentTime - target) > 0.045) {
      try { video.currentTime = target; } catch { /* Seek once metadata is ready. */ }
    }
  }
}

function updateScroll() {
  scrollQueued = false;
  chooseActiveChapter();
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const overall = clamp(window.scrollY / maxScroll);
  document.documentElement.style.setProperty('--scroll-progress', String(overall));
  if (progressFill) progressFill.style.transform = `scaleX(${overall})`;
  if (!motionPaused) {
    const drift = Math.max(-48, Math.min(48, window.scrollY * 0.012));
    document.querySelectorAll('.parallax-layer[data-depth]').forEach((layer) => {
      const depth = Number(layer.dataset.depth) || 0;
      layer.style.transform = `translate3d(0, ${-drift * depth * 2.2}px, 0)`;
    });
  }
  updateVideos();
  window.dispatchEvent(new CustomEvent('mxr:scrollstate', { detail: { scene: activeChapter?.dataset.scene, progress: sectionProgress(activeChapter) } }));
}

function requestScrollUpdate() {
  if (scrollQueued) return;
  scrollQueued = true;
  window.requestAnimationFrame(updateScroll);
}
window.addEventListener('scroll', requestScrollUpdate, { passive: true });
window.addEventListener('resize', requestScrollUpdate, { passive: true });
window.addEventListener('load', requestScrollUpdate, { once: true });

for (const video of videos) {
  video.addEventListener('loadedmetadata', requestScrollUpdate);
  video.addEventListener('play', () => { video.dataset.userPlaying = 'true'; });
  video.addEventListener('pause', () => { delete video.dataset.userPlaying; requestScrollUpdate(); });
}

motionToggle?.addEventListener('click', () => {
  motionPaused = !motionPaused;
  document.documentElement.classList.toggle('motion-paused', motionPaused);
  motionToggle.setAttribute('aria-pressed', String(motionPaused));
  motionToggle.textContent = motionPaused ? '开启动态' : '暂停动态';
  if (motionPaused) videos.forEach((video) => video.pause());
  requestScrollUpdate();
});

// Motion vectors are provisional visual-breakdown values from the project's CSV.
// Blender Z-up vectors are converted to glTF/Three.js Y-up coordinates.
const explodedParts = [
  { name: 'FACE-TOWEL-ROTATING-COVERA_ASM__ASM', delta: [0, 0.045, 0] },
  { name: 'FACE-TOWEL-LCD_24', delta: [0, 0, 0.040] },
  { name: 'FACE-TOWEL-CAMERA-ASS_ASM_60_ASM', delta: [0, 0, 0.055] },
  { name: 'FACE-TOWEL-SLIDING-COVER-ASS_AS_ASM', delta: [0, 0, 0.065] },
  { name: 'FACE-TOWEL-SLIDING-BOTTOM-CVASM_ASM', delta: [0, 0, 0.085] },
  { name: 'HIGH-VOLTAGE-BOARD-PCBA_19', delta: [0.050, 0, 0] },
  { name: 'RAPID-HEAT-PIPE-BRACKET_ASM_60_ASM', delta: [-0.055, 0, 0] },
  { name: 'FACE-TOWEL-BOTTOM-COVER_ASM_27_ASM', delta: [0, -0.055, 0] },
];

const cameraByScene = {
  morning: { position: [0.10, 0.22, 6.0], x: 1.15, y: -0.04, scale: 1.00 },
  tech: { position: [0.12, 0.14, 5.1], x: 1.05, y: 0.04, yaw: 0.08, scale: 0.96 },
  studio: { position: [0.02, 0.20, 5.5], x: 0.92, y: 0.02, yaw: 0.16, scale: 1.05 },
  soft: { position: [0.15, 0.10, 6.1], x: 1.20, y: -0.03, yaw: 0.04, scale: 0.88 },
  warm: { position: [0.00, 0.16, 5.4], x: 0.84, y: 0.00, yaw: 0, scale: 0.95 },
};

let renderer = null;
let scene = null;
let camera = null;
let pivot = null;
let model = null;
let baseScale = 1;
let explosionRecords = [];
let modelReady = false;
let animationFrame = 0;
let lastFrame = 0;

function showFallback(message) {
  world?.classList.add('is-fallback');
  world?.classList.remove('is-ready');
  if (loaderText && message) loaderText.textContent = message;
  if (loader) {
    if (message) loader.classList.remove('is-hidden');
    window.setTimeout(() => loader.classList.add('is-hidden'), message ? 2200 : 0);
  }
}

function hideLoader() {
  window.setTimeout(() => loader?.classList.add('is-hidden'), 450);
}

function prepareExplosion(THREE) {
  if (!model || !pivot) return;
  model.updateMatrixWorld(true);
  pivot.updateMatrixWorld(true);
  explosionRecords = [];
  for (const part of explodedParts) {
    const object = model.getObjectByName(part.name);
    if (!object?.parent) continue;
    const parent = object.parent;
    const base = object.position.clone();
    const worldOrigin = object.getWorldPosition(new THREE.Vector3());
    const worldDelta = new THREE.Vector3(...part.delta).multiplyScalar(baseScale);
    const localBase = parent.worldToLocal(worldOrigin.clone());
    const localTarget = parent.worldToLocal(worldOrigin.clone().add(worldDelta));
    const localDelta = localTarget.sub(localBase);
    explosionRecords.push({ object, base, delta: localDelta });
  }
}

function applyExplosion(progress) {
  const amount = clamp(progress) * 0.86;
  for (const item of explosionRecords) {
    item.object.position.copy(item.base).addScaledVector(item.delta, amount);
  }
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const lowPower = reducedMotion || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 6) || width < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.05 : 1.45));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function renderFrame(now = 0) {
  animationFrame = 0;
  if (!renderer || !scene || !camera || document.hidden) return;
  if (now - lastFrame > 32) {
    lastFrame = now;
    const key = document.body.dataset.scene || 'morning';
    const target = cameraByScene[key] || cameraByScene.morning;
    if (!motionPaused) {
      camera.position.x += (target.position[0] - camera.position.x) * 0.035;
      camera.position.y += (target.position[1] - camera.position.y) * 0.035;
      camera.position.z += (target.position[2] - camera.position.z) * 0.035;
      camera.lookAt(0, 0.08, 0);
      if (pivot) {
        pivot.position.x += (target.x - pivot.position.x) * 0.045;
        pivot.position.y += (target.y - pivot.position.y) * 0.045;
        pivot.scale.x += (baseScale * target.scale - pivot.scale.x) * 0.04;
        pivot.scale.y = pivot.scale.x;
        pivot.scale.z = pivot.scale.x;
        pivot.rotation.y += ((target.yaw || 0) + Math.sin(now * 0.00017) * 0.028 - pivot.rotation.y) * 0.025;
      }
      const p = key === 'studio' ? sectionProgress(document.getElementById('structure')) : 0;
      applyExplosion(p);
    }
    renderer.render(scene, camera);
  }
  animationFrame = window.requestAnimationFrame(renderFrame);
}

async function initThree() {
  if (reducedMotion) {
    showFallback('已启用减少动态效果，使用静态产品图');
    return;
  }
  const timeout = window.setTimeout(() => {
    if (!modelReady) showFallback('产品模型载入较慢，先显示产品图');
  }, 9000);
  try {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const rendererIsAvailable = (() => {
      try {
        const probe = document.createElement('canvas');
        return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
      }
      catch { return false; }
    })();
    if (!rendererIsAvailable) throw new Error('WebGL unavailable');

    const lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 6) || window.innerWidth < 700;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(...cameraByScene.morning.position);
    camera.lookAt(0, 0.08, 0);
    scene.add(new THREE.HemisphereLight(0xf6fbff, 0xb8c5cb, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(-3.5, 5.0, 4.2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xaadcf0, 1.7);
    rimLight.position.set(3.5, 2.5, -3.0);
    scene.add(rimLight);
    const fillLight = new THREE.DirectionalLight(0xffead9, 0.65);
    fillLight.position.set(1, -1.5, 3.5);
    scene.add(fillLight);

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (loaderBar && total > 0) loaderBar.style.width = `${Math.round((loaded / total) * 100)}%`;
    };
    const loader3d = new GLTFLoader(manager);
    loader3d.load('./assets/mxr-test-export.glb', (gltf) => {
      model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const modelHeight = Math.max(size.x, size.y, size.z, 0.01);
      baseScale = 3.0 / modelHeight;
      model.position.sub(center);
      pivot = new THREE.Group();
      pivot.add(model);
      pivot.scale.setScalar(baseScale);
      scene.add(pivot);
      model.updateMatrixWorld(true);
      prepareExplosion(THREE);
      modelReady = true;
      world?.classList.remove('is-fallback');
      world?.classList.add('is-ready');
      if (loaderText) loaderText.textContent = '产品结构预览已就绪';
      if (loaderBar) loaderBar.style.width = '100%';
      window.clearTimeout(timeout);
      hideLoader();
      resizeRenderer();
      requestScrollUpdate();
      if (!animationFrame) animationFrame = window.requestAnimationFrame(renderFrame);
    }, (event) => {
      if (event.total > 0 && loaderBar) loaderBar.style.width = `${Math.round((event.loaded / event.total) * 100)}%`;
    }, (error) => {
      console.warn('MXR model preview could not be loaded.', error);
      window.clearTimeout(timeout);
      showFallback('产品结构预览不可用，已切换至产品图');
    });
    resizeRenderer();
  } catch (error) {
    console.warn('Three.js could not initialize; the static product image remains available.', error);
    window.clearTimeout(timeout);
    showFallback('3D 预览不可用，已切换至产品图');
  }
}

window.addEventListener('resize', resizeRenderer, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && renderer && !animationFrame) animationFrame = window.requestAnimationFrame(renderFrame);
});
initThree();
requestScrollUpdate();
