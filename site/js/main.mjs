import { measureStoryState } from './scroll-timeline.mjs';
import { createCinematicWorld } from './cinematic-world.mjs';

const chapters = [...document.querySelectorAll('.chapter')];
const videos = [...document.querySelectorAll('video[data-scrub]')];
const world = document.getElementById('world');
const canvas = document.getElementById('worldCanvas');
const loader = document.getElementById('loadingNote');
const loaderText = document.getElementById('loadingText');
const loaderBar = document.getElementById('loadingBar');
const progressFill = document.getElementById('progressFill');
const stepText = document.getElementById('worldStep');
const stageText = document.getElementById('worldStage');
const motionToggle = document.getElementById('motionToggle');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const chapterLinks = [...document.querySelectorAll('.chapter-rail a')];
let reducedMotion = reducedMotionQuery.matches;
let ambientMotion = !reducedMotion;
let timeline = measureStoryState(chapters, window.innerHeight, window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
let activeChapter = timeline.element;
let worldApp = null;
let updateQueued = false;
let animationFrame = 0;
let lastFrame = 0;
let modelLoading = false;
let modelAttempted = false;
let pointerX = 0;
let pointerY = 0;

const sceneLabels = ['晨光入场', '靠近，识肤开始', '读懂状态', '产品结构展开', '压缩毛巾遇水舒展', '抽屉送达预演', '回到清晨日常', '触感与细节回环', '品牌终章'];

function setMotionLabel() {
  if (!motionToggle) return;
  motionToggle.setAttribute('aria-pressed', String(!ambientMotion));
  motionToggle.setAttribute('aria-label', ambientMotion ? '暂停氛围动效' : '开启氛围动效');
  motionToggle.textContent = ambientMotion ? '氛围动效：开' : '氛围动效：关';
  document.documentElement.classList.toggle('motion-paused', !ambientMotion);
}

function showFallback(message, hideAfter = 2600) {
  world?.classList.add('is-fallback');
  world?.classList.remove('has-model');
  if (loaderText && message) loaderText.textContent = message;
  if (loader) {
    loader.classList.remove('is-hidden');
    if (hideAfter > 0) window.setTimeout(() => loader.classList.add('is-hidden'), hideAfter);
  }
}

function hideLoader() {
  window.setTimeout(() => loader?.classList.add('is-hidden'), 650);
}

function updateActiveChapter() {
  timeline = measureStoryState(
    chapters,
    window.innerHeight,
    window.scrollY,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  activeChapter = timeline.element;
  chapters.forEach((chapter, index) => chapter.classList.toggle('is-active', index === timeline.index));
  if (activeChapter) document.body.dataset.scene = activeChapter.dataset.scene || 'intro';
  document.documentElement.style.setProperty('--scroll-progress', String(timeline.page));
  document.documentElement.style.setProperty('--chapter-progress', String(timeline.progress));
  if (progressFill) progressFill.style.transform = `scaleX(${timeline.page})`;
  if (stepText) stepText.textContent = String(timeline.index + 1).padStart(2, '0');
  if (stageText) stageText.textContent = sceneLabels[timeline.index] || '棉小柔';

  chapterLinks.forEach((link) => {
    const current = link.hash === `#${timeline.id}`;
    if (current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });

  const navOwner = timeline.id === 'result' ? 'skin'
    : timeline.id === 'drawer' ? 'towel'
      : timeline.id === 'texture' ? 'ritual'
        : timeline.id;
  document.querySelectorAll('.topnav a').forEach((link) => {
    if (link.hash === `#${navOwner}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });

  if (activeChapter) {
    const linkedVideo = activeChapter.querySelector('video[data-scrub]');
    if (linkedVideo && linkedVideo.readyState === HTMLMediaElement.HAVE_NOTHING) linkedVideo.load();
  }
  updateVideos();
  window.dispatchEvent(new CustomEvent('mxr:scrollstate', { detail: timeline }));

  if (timeline.id === 'structure' && !modelAttempted && !modelLoading) loadProductModel();
}

function updateVideos() {
  for (const video of videos) {
    const owner = video.closest('.chapter');
    if (owner !== activeChapter || video.dataset.userPlaying === 'true') continue;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < HTMLMediaElement.HAVE_METADATA) continue;
    const target = timeline.progress * video.duration;
    if (Math.abs(video.currentTime - target) > 0.045) {
      try { video.currentTime = target; } catch { /* Wait for metadata before seeking again. */ }
    }
  }
}

function requestScrollUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  window.requestAnimationFrame(() => {
    updateQueued = false;
    updateActiveChapter();
  });
}

function frame(now = 0) {
  animationFrame = 0;
  if (document.hidden || !worldApp) return;
  const lowPower = window.innerWidth < 760 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 6);
  const interval = lowPower ? 1000 / 30 : 1000 / 60;
  if (now - lastFrame >= interval) {
    const deltaSeconds = lastFrame ? Math.min(0.06, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    worldApp.update(timeline, deltaSeconds, { ambient: ambientMotion, pointerX, pointerY, reducedMotion: reducedMotion && !ambientMotion });
  }
  animationFrame = window.requestAnimationFrame(frame);
}

function startFrameLoop() {
  if (!animationFrame && !document.hidden) animationFrame = window.requestAnimationFrame(frame);
}

function loadProductModel() {
  if (!worldApp || modelLoading || modelAttempted) return;
  modelAttempted = true;
  const saveData = Boolean(navigator.connection?.saveData);
  const tinyDevice = Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2;
  if (saveData || tinyDevice) {
    showFallback('已为省流/低配设备保留轻量场景与产品图');
    return;
  }
  modelLoading = true;
  if (loaderText) loaderText.textContent = '正在载入产品三维结构';
  if (loaderBar) loaderBar.style.width = '78%';
  worldApp.loadModelAsset().then((ok) => {
    modelLoading = false;
    if (ok) {
      world?.classList.add('has-model');
      world?.classList.remove('is-fallback');
      if (loaderText) loaderText.textContent = '连续镜头已就绪';
      if (loaderBar) loaderBar.style.width = '100%';
      hideLoader();
      requestScrollUpdate();
      return;
    }
    showFallback('三维模型暂不可用，已保留产品图与空间场景');
  });
}

async function initWorld() {
  if (!canvas || !world) return;
  const probe = document.createElement('canvas');
  const canRender = Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  if (!canRender) {
    showFallback('当前设备不支持 WebGL，已切换为静态产品图');
    return;
  }
  try {
    if (loaderText) loaderText.textContent = '正在搭建清晨护理空间';
    worldApp = await createCinematicWorld({
      canvas,
      loadModel: true,
      onProgress: (value, label) => {
        if (loaderText && label) loaderText.textContent = label;
        if (loaderBar && Number.isFinite(value)) loaderBar.style.width = `${Math.round(value * 100)}%`;
      },
      onModelReady: (result) => {
        if (!result.ok) showFallback('三维模型暂不可用，已保留产品图与空间场景');
      },
    });
    world?.classList.add('is-ready');
    document.documentElement.classList.add('spatial-ready');
    worldApp.update(timeline, 1 / 60, { ambient: ambientMotion, pointerX, pointerY, reducedMotion: reducedMotion && !ambientMotion });
    startFrameLoop();
    if (navigator.connection?.saveData || (Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2)) {
      showFallback('已为省流/低配设备保留轻量场景与产品图');
    } else if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadProductModel, { timeout: 1800 });
    } else {
      window.setTimeout(loadProductModel, 500);
    }
  } catch (error) {
    console.warn('Three.js world could not initialize; keep the static product image.', error);
    showFallback('3D 空间暂不可用，已切换至产品图');
  }
}

window.addEventListener('scroll', requestScrollUpdate, { passive: true });
window.addEventListener('resize', () => {
  worldApp?.resize();
  requestScrollUpdate();
}, { passive: true });
window.addEventListener('load', requestScrollUpdate, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
    return;
  }
  requestScrollUpdate();
  startFrameLoop();
});

for (const video of videos) {
  video.addEventListener('loadedmetadata', requestScrollUpdate);
  video.addEventListener('play', () => { video.dataset.userPlaying = 'true'; });
  video.addEventListener('pause', () => { delete video.dataset.userPlaying; requestScrollUpdate(); });
}

motionToggle?.addEventListener('click', () => {
  ambientMotion = !ambientMotion;
  setMotionLabel();
  requestScrollUpdate();
});

reducedMotionQuery.addEventListener?.('change', (event) => {
  reducedMotion = event.matches;
  if (reducedMotion) ambientMotion = false;
  setMotionLabel();
});

window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' || reducedMotion || !ambientMotion) return;
  pointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
  pointerY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
}, { passive: true });

for (const video of videos) video.preload = 'none';
setMotionLabel();
updateActiveChapter();
initWorld();
