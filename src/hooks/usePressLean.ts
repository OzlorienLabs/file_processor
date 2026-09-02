import { useCallback, useEffect, useRef } from 'react';

/** Broadsheet's plate constructions read the lean as a bare -1..1 factor. */
const NX = '--press-nx';
const NY = '--press-ny';

function motionIsWanted(): boolean {
  if (document.documentElement.classList.contains('calm')) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Leans a plate construction's misregistration toward the pointer. Returns a ref callback for
 * the element carrying the plates; the lean stays at zero when motion is switched off, so the
 * headline simply holds its printed register.
 */
export function usePressLean(): (element: HTMLElement | null) => void {
  const target = useRef<HTMLElement | null>(null);

  const ref = useCallback((element: HTMLElement | null) => {
    target.current = element;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const element = target.current;
      if (!element) return;
      if (!motionIsWanted()) {
        element.style.removeProperty(NX);
        element.style.removeProperty(NY);
        return;
      }
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      element.style.setProperty(NX, (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
      element.style.setProperty(NY, (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
    };

    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return ref;
}
