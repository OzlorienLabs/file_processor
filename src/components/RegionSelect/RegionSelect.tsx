import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

import { isFullRegion, moveRegion, regionFromPoints, toPixelRect, type Region } from '../../lib/region';

interface RegionSelectProps {
  /** Pixel size of the media underneath; sets the stage's aspect ratio and the size readout. */
  frameWidth: number;
  frameHeight: number;
  region: Region;
  onChange: (region: Region) => void;
  label: string;
  /** The `<video>` being cropped; it fills the stage exactly. */
  children: ReactNode;
}

type Drag =
  | { kind: 'draw'; x: number; y: number }
  | { kind: 'move'; x: number; y: number; from: Region };

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;

/**
 * Drag on the picture to draw a crop box, drag inside the box to move it. The media keeps
 * its own aspect ratio, so normalised pointer positions map straight onto frame pixels.
 * Keyboard users set the same box with `RegionFields`.
 */
export function RegionSelect({ frameWidth, frameHeight, region, onChange, label, children }: RegionSelectProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const pixels = toPixelRect(region, frameWidth, frameHeight);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = layer.current!.getBoundingClientRect();
    return {
      x: box.width ? (event.clientX - box.left) / box.width : 0,
      y: box.height ? (event.clientY - box.top) / box.height : 0,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = point(event);
    const inside =
      !isFullRegion(region) &&
      x >= region.x && x <= region.x + region.width &&
      y >= region.y && y <= region.y + region.height;
    setDrag(inside ? { kind: 'move', x, y, from: region } : { kind: 'draw', x, y });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const { x, y } = point(event);
    onChange(drag.kind === 'move' ? moveRegion(drag.from, x - drag.x, y - drag.y) : regionFromPoints(drag.x, drag.y, x, y));
  };

  const endDrag = () => setDrag(undefined);

  const style = { '--region-ratio': `${frameWidth} / ${frameHeight}` } as CSSProperties;

  return (
    <div className="region-stage" style={style}>
      {children}
      <div
        className="region-layer"
        ref={layer}
        role="group"
        aria-label={label}
        data-dragging={drag ? drag.kind : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="region-box"
          data-testid="region-box"
          style={{ left: percent(region.x), top: percent(region.y), width: percent(region.width), height: percent(region.height) }}
        >
          <span className="region-size gi">
            {pixels.width} × {pixels.height}
          </span>
        </div>
      </div>
    </div>
  );
}
