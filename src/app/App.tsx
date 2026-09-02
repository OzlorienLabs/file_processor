import { ArrowRight, Code2, Menu, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { HomePage } from '../pages/HomePage';
import { ToolPage } from '../pages/ToolPage';
import { coreTools } from './tool-catalog';

const EmojiPage = lazy(() => import('../pages/EmojiPage'));

function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <header className="site-header g2">
      <div className="shell header-inner">
        <Link className="brand" to="/en" aria-label="FileKit home">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>FileKit</span>
        </Link>
        <button
          className="nav-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav
          className="primary-nav"
          data-open={isOpen ? 'true' : 'false'}
          id="primary-navigation"
          aria-label="Primary navigation"
        >
          <Link to="/en" onClick={() => setIsOpen(false)}>
            All tools
          </Link>
        </nav>
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="site-footer g2">
      <div className="shell footer-inner">
        <div>
          <Link className="brand" to="/en">
            <span className="brand-mark" aria-hidden="true">
              F
            </span>
            <span>FileKit</span>
          </Link>
          <p>Files in. Useful result out. Nothing left behind.</p>
        </div>
        <div className="footer-links">
          <Link to="/en">All tools</Link>
          <Link to="/en/emojis">Every emoji</Link>
          <a href="https://github.com" aria-label="Project source on GitHub">
            <Code2 aria-hidden="true" size={18} /> Source
          </a>
        </div>
      </div>
    </footer>
  );
}

function EmojiLoading() {
  return (
    <main className="shell narrow-page page-section">
      <p className="progress-note" role="status">Loading the emoji library…</p>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="shell narrow-page page-section center-copy">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="lede">That route is not part of the toolkit.</p>
      <Link className="button button-primary" to="/en">
        Back to all tools <ArrowRight aria-hidden="true" size={18} />
      </Link>
    </main>
  );
}

export function AppRoutes() {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Navigate to="/en" replace />} />
        <Route path="/en" element={<HomePage />} />
        {coreTools.map((tool) => (
          <Route key={tool.id} path={tool.path} element={<ToolPage tool={tool} />} />
        ))}
        <Route
          path="/en/emojis"
          element={
            <Suspense fallback={<EmojiLoading />}>
              <EmojiPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AppFooter />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
