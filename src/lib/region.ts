/**
 * A crop area in normalised coordinates: every field is a fraction (0–1) of the frame it
 * sits on. Keeping it resolution-free lets the same selection follow a capture whose size
 * changes mid-recording, and lets the on-screen overlay work at any display size.
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A crop area in whole source pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_REGION: Region = { x: 0, y: 0, width: 1, height: 1 };

/** The smallest selection, as a fraction of the frame, so a stray click never makes a 0×0 crop. */
export const MIN_REGION = 0.02;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps a region inside the frame and at least `MIN_REGION` wide and tall. */
export function clampRegion(region: Region): Region {
  const width = clamp(region.width, MIN_REGION, 1);
  const height = clamp(region.height, MIN_REGION, 1);
  return {
    x: clamp(region.x, 0, 1 - width),
    y: clamp(region.y, 0, 1 - height),
    width,
    height,
  };
}

/** The rectangle spanned by two normalised points, in either drag direction. */
export function regionFromPoints(ax: number, ay: number, bx: number, by: number): Region {
  const left = clamp(Math.min(ax, bx), 0, 1);
  const top = clamp(Math.min(ay, by), 0, 1);
  const right = clamp(Math.max(ax, bx), 0, 1);
  const bottom = clamp(Math.max(ay, by), 0, 1);
  return clampRegion({ x: left, y: top, width: right - left, height: bottom - top });
}

/** Moves a region by a normalised offset without letting it leave the frame. */
export function moveRegion(region: Region, dx: number, dy: number): Region {
  return clampRegion({ ...region, x: region.x + dx, y: region.y + dy });
}

export function isFullRegion(region: Region): boolean {
  return region.x === 0 && region.y === 0 && region.width === 1 && region.height === 1;
}

const even = (value: number) => Math.floor(value / 2) * 2;

/**
 * Resolves a region against a frame size. Video encoders and 4:2:0 frames want even
 * offsets and sizes, so every edge snaps down to an even pixel (never below 2 px).
 */
export function toPixelRect(region: Region, frameWidth: number, frameHeight: number): PixelRect {
  const safe = clampRegion(region);
  const x = even(safe.x * frameWidth);
  const y = even(safe.y * frameHeight);
  const width = Math.max(2, Math.min(even(safe.width * frameWidth), even(frameWidth - x)));
  const height = Math.max(2, Math.min(even(safe.height * frameHeight), even(frameHeight - y)));
  return { x, y, width, height };
}

/** The normalised region for a pixel rectangle typed into the numeric fields. */
export function fromPixelRect(rect: PixelRect, frameWidth: number, frameHeight: number): Region {
  return clampRegion({
    x: rect.x / frameWidth,
    y: rect.y / frameHeight,
    width: rect.width / frameWidth,
    height: rect.height / frameHeight,
  });
}
