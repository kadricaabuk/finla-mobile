export type Camera = { x: number; y: number; scale: number };

/**
 * CSS transform that keeps `cam`'s focus point centered on a canvas of `vw×vh`.
 * `depth` < 1 makes a layer move less (parallax).
 */
export const cameraTransform = (
  cam: Camera,
  depth = 1,
  vw = 1920,
  vh = 1080,
) => {
  const s = 1 + (cam.scale - 1) * depth;
  const cx = vw / 2;
  const cy = vh / 2;
  const x = cx - (cx + (cam.x - cx) * depth) * s;
  const y = cy - (cy + (cam.y - cy) * depth) * s;
  return `translate(${x}px, ${y}px) scale(${s})`;
};

/** Phone rests at the same relative spot as the 1920×1080 intro (cy = 470). */
export const phoneCenter = (width: number, height: number) => ({
  cx: width / 2,
  cy: height * (470 / 1080),
});
