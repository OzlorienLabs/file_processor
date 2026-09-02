import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { setMatchedMedia } from '../test/media';
import { usePressLean } from './usePressLean';

function Headline() {
  const press = usePressLean();
  return (
    <h1 className="cmyk-head" ref={press} data-testid="headline">
      Result out.
    </h1>
  );
}

function move(x: number, y: number) {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
}

/** jsdom gives every element a zero box, so the hook needs a real one to measure against. */
function sizeHeadline(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
}

afterEach(() => {
  document.documentElement.classList.remove('calm');
});

describe('usePressLean', () => {
  it('publishes the pointer lean as a -1 to 1 factor', () => {
    const { getByTestId } = render(<Headline />);
    const headline = getByTestId('headline');
    sizeHeadline(headline);

    move(200, 100);
    expect(headline.style.getPropertyValue('--press-nx')).toBe('1.000');
    expect(headline.style.getPropertyValue('--press-ny')).toBe('1.000');

    move(0, 50);
    expect(headline.style.getPropertyValue('--press-nx')).toBe('-1.000');
    expect(headline.style.getPropertyValue('--press-ny')).toBe('0.000');
  });

  it('holds the register when reduce motion is on', () => {
    const { getByTestId } = render(<Headline />);
    const headline = getByTestId('headline');
    sizeHeadline(headline);
    move(200, 100);

    document.documentElement.classList.add('calm');
    move(0, 0);
    expect(headline.style.getPropertyValue('--press-nx')).toBe('');
  });

  it('holds the register when the system asks for reduced motion', () => {
    setMatchedMedia(['(prefers-reduced-motion: reduce)']);
    const { getByTestId } = render(<Headline />);
    const headline = getByTestId('headline');
    sizeHeadline(headline);

    move(200, 100);
    expect(headline.style.getPropertyValue('--press-nx')).toBe('');
  });

  it('ignores a pointer move before the element is measured', () => {
    render(<Headline />);
    expect(() => move(10, 10)).not.toThrow();
  });
});
