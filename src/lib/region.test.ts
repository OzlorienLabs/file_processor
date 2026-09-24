import { describe, expect, it } from 'vitest';

import {
  clampRegion,
  fromPixelRect,
  FULL_REGION,
  isFullRegion,
  MIN_REGION,
  moveRegion,
  regionFromPoints,
  toPixelRect,
} from './region';

describe('region', () => {
  it('keeps a region inside the frame with a minimum size', () => {
    expect(clampRegion({ x: -0.2, y: 0.95, width: 0.5, height: 0.001 })).toEqual({
      x: 0,
      y: 0.95,
      width: 0.5,
      height: MIN_REGION,
    });
    expect(clampRegion({ x: 0.2, y: 0.2, width: 3, height: 3 })).toEqual(FULL_REGION);
  });

  it('spans two points in any drag direction and clips at the edges', () => {
    expect(regionFromPoints(0.8, 0.9, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.8 });
    expect(regionFromPoints(-1, -1, 2, 2)).toEqual(FULL_REGION);
    expect(regionFromPoints(0.5, 0.5, 0.5, 0.5).width).toBe(MIN_REGION);
  });

  it('moves a region without letting it leave the frame', () => {
    const region = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    expect(moveRegion(region, 0.2, 0.1)).toMatchObject({ x: 0.30000000000000004, y: 0.2 });
    expect(moveRegion(region, 1, -1)).toMatchObject({ x: 0.5, y: 0 });
  });

  it('knows the whole frame', () => {
    expect(isFullRegion(FULL_REGION)).toBe(true);
    expect(isFullRegion({ ...FULL_REGION, x: 0.1 })).toBe(false);
  });

  it('resolves to even pixel rectangles that fit the frame', () => {
    expect(toPixelRect(FULL_REGION, 1921, 1081)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(toPixelRect({ x: 0.333, y: 0.5, width: 0.333, height: 0.5 }, 1000, 501)).toEqual({ x: 332, y: 250, width: 332, height: 250 });
    expect(toPixelRect({ x: 0, y: 0, width: 0.02, height: 0.02 }, 20, 20)).toEqual({ x: 0, y: 0, width: 2, height: 2 });
  });

  it('turns typed pixels back into a normalised region', () => {
    expect(fromPixelRect({ x: 100, y: 50, width: 200, height: 100 }, 400, 200)).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(fromPixelRect({ x: 390, y: 0, width: 200, height: 0 }, 400, 200)).toEqual({ x: 0.5, y: 0, width: 0.5, height: MIN_REGION });
  });
});
