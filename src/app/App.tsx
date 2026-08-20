import { ArrowRight, Code2, Menu, X } from 'lucide-react';
import { useState } from 'react';
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

function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <header className="site-header">
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
          <Link to="/en/emojis" onClick={() => setIsOpen(false)}>
            Emoji library
          </Link>
          <a href="#privacy" onClick={() => setIsOpen(false)}>
            Privacy
          </a>
        </nav>
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="site-footer">
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

function EmojiPlaceholder() {
  return (
    <main className="shell narrow-page page-section">
      <p className="eyebrow">Unicode 17.0</p>
      <h1>Every emoji, one searchable library</h1>
      <p className="lede">
        The complete catalog is being loaded separately so the file tools stay fast.
      </p>
      <Link className="button button-secondary" to="/en">
        Back to all tools <ArrowRight aria-hidden="true" size={18} />
      </Link>
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
        <Route path="/en/emojis" element={<EmojiPlaceholder />} />
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
