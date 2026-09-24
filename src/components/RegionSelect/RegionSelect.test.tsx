import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FULL_REGION, type Region } from '../../lib/region';
import { RegionFields } from './RegionFields';
import { RegionSelect } from './RegionSelect';

function Harness({ initial, onChange }: { initial: Region; onChange?: (region: Region) => void }) {
  const [region, setRegion] = useState(initial);
  return (
    <>
      <RegionSelect
        frameWidth={1000}
        frameHeight={500}
        region={region}
        label="Area to record"
        onChange={(next) => {
          onChange?.(next);
          setRegion(next);
        }}
      >
        <video aria-label="picture" />
      </RegionSelect>
      <RegionFields frameWidth={1000} frameHeight={500} region={region} onChange={setRegion} />
    </>
  );
}

/** The overlay measures 200×100 px on screen. */
function layer() {
  const element = screen.getByRole('group', { name: 'Area to record' });
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  return element;
}

const box = () => screen.getByTestId('region-box');

describe('RegionSelect', () => {
  it('draws a new box by dragging and reports its pixel size', () => {
    const onChange = vi.fn();
    render(<Harness initial={FULL_REGION} onChange={onChange} />);
    expect(screen.getByLabelText('picture')).toBeInTheDocument();
    expect(box()).toHaveTextContent('1000 × 500');
    const target = layer();

    fireEvent.pointerDown(target, { button: 0, clientX: 20, clientY: 10, pointerId: 1 });
    expect(target).toHaveAttribute('data-dragging', 'draw');
    fireEvent.pointerMove(target, { clientX: 120, clientY: 60 });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    expect(box()).toHaveStyle({ left: '10.000%', width: '50.000%' });
    expect(box()).toHaveTextContent('500 × 250');

    fireEvent.pointerUp(target);
    fireEvent.pointerMove(target, { clientX: 190, clientY: 90 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves the box when the drag starts inside it', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }} onChange={onChange} />);
    const target = layer();
    fireEvent.pointerDown(target, { button: 0, clientX: 50, clientY: 30 });
    expect(target).toHaveAttribute('data-dragging', 'move');
    fireEvent.pointerMove(target, { clientX: 70, clientY: 40 });
    expect(onChange.mock.lastCall![0].x).toBeCloseTo(0.2);
    expect(onChange.mock.lastCall![0].y).toBeCloseTo(0.2);
    fireEvent.pointerCancel(target);
    expect(target).not.toHaveAttribute('data-dragging');
  });

  it('ignores other buttons and copes with an unmeasured overlay', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }} onChange={onChange} />);
    const target = screen.getByRole('group', { name: 'Area to record' });
    fireEvent.pointerDown(target, { button: 2, clientX: 5, clientY: 5 });
    expect(target).not.toHaveAttribute('data-dragging');
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 });
    expect(onChange).not.toHaveBeenCalled();

    // jsdom lays nothing out, so the overlay measures 0×0 and every point maps to the corner.
    fireEvent.pointerDown(target, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(target, { clientX: 50, clientY: 50 });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0.02, height: 0.02 });
  });
});

describe('RegionFields', () => {
  it('applies typed pixels on Enter or blur and snaps to what fits', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }} />);
    const width = screen.getByLabelText('Width');
    expect(width).toHaveValue(500);

    await user.clear(width);
    await user.type(width, '301{Enter}');
    expect(box()).toHaveTextContent('300 × 250');
    expect(screen.getByLabelText('Width')).toHaveValue(300);

    const left = screen.getByLabelText('Left');
    await user.clear(left);
    await user.type(left, '5000');
    await user.tab();
    expect(screen.getByLabelText('Left')).toHaveValue(700);

    const top = screen.getByLabelText('Top');
    await user.clear(top);
    await user.tab();
    expect(screen.getByLabelText('Top')).toHaveValue(50);

    await user.type(screen.getByLabelText('Height'), '{Shift}');
    await user.click(screen.getByRole('button', { name: /select everything/i }));
    expect(box()).toHaveTextContent('1000 × 500');
    expect(screen.getByRole('button', { name: /select everything/i })).toBeDisabled();
  });
});
