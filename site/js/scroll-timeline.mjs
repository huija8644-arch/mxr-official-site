export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Maps page scroll to a continuous, reversible camera journey between chapter starts.
 * A stage finishes at the next chapter boundary, so navigation, copy, video and scene stay aligned.
 */
export function measureStoryState(chapters, viewportHeight, scrollY, maxScroll) {
  if (!chapters.length) {
    return { index: 0, progress: 0, journey: 0, page: 0, id: '', scene: 'intro', element: null };
  }

  const starts = chapters.map((chapter) => {
    const rect = chapter.getBoundingClientRect();
    return scrollY + rect.top;
  });

  const lastIndex = chapters.length - 1;
  let index = 0;
  while (index < lastIndex && scrollY >= starts[index + 1]) index += 1;

  const segmentStart = starts[index];
  const segmentEnd = index < lastIndex ? starts[index + 1] : Math.max(segmentStart + 1, maxScroll);
  const progress = clamp((scrollY - segmentStart) / Math.max(1, segmentEnd - segmentStart));
  const active = chapters[index];
  const journey = chapters.length < 2 ? 0 : clamp((index + progress) / lastIndex);
  const page = clamp(scrollY / Math.max(1, maxScroll));

  return {
    index,
    progress,
    journey,
    page,
    id: active.id,
    scene: active.dataset.scene || 'intro',
    element: active,
  };
}
