import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { trackPageView } from '../lib/analytics';

/** Reports each route change to GA4; renders nothing. */
export function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
