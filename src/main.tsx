import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
// Source Serif 4, self-hosted so `font-src 'self'` holds and no request reaches Google.
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-600.css';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
