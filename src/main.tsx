import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { initAnalytics, isLocalHost } from './lib/analytics';
// Source Serif 4, self-hosted so `font-src 'self'` holds and no request reaches Google.
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-600.css';
import './styles/global.css';

// Production builds only, so local dev and previews never pollute the GA stream.
if (import.meta.env.PROD) initAnalytics();

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics self-hosts from /_vercel/insights (same origin, no cookies),
        a route `vite preview` does not serve. */}
    {isLocalHost() ? null : <Analytics />}
  </StrictMode>,
);
