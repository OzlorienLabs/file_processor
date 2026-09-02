import { useCallback, useEffect, useState } from 'react';

function isFullscreenNow(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

export interface FullscreenControl {
  supported: boolean;
  active: boolean;
  enter: () => void;
  toggle: () => void;
}

/**
 * The Fullscreen API for the whole document. The `fullscreenchange` listener keeps `active`
 * true to the browser, so the toolbar label stays right after the user presses Escape.
 */
export function useFullscreen(): FullscreenControl {
  const [active, setActive] = useState(isFullscreenNow);
  const supported =
    typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';

  useEffect(() => {
    const onChange = () => setActive(isFullscreenNow());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enter = useCallback(() => {
    if (!supported || isFullscreenNow()) return;
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (isFullscreenNow()) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, [supported]);

  return { supported, active, enter, toggle };
}
