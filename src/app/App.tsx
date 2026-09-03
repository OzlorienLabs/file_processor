import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { ToolMark } from '../components/ToolMark/ToolMark';
import { HomePage } from '../pages/HomePage';
import { ToolPage } from '../pages/ToolPage';
import { coreTools } from './tool-catalog';

const EmojiPage = lazy(() => import('../pages/EmojiPage'));

function AppHeader() {
  return (
    <header className="site-header g2">
      <Link className="brand" to="/en" aria-label="FileKit home">
        <span className="brand-mark">
          <ToolMark tool="brand" />
        </span>
        <span>FileKit</span>
      </Link>
      <Link className="button button-primary header-cta" to={coreTools[0].path}>
        Open the workspace <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="site-footer">
      <Link className="brand" to="/en">
        <span className="brand-mark">
          <ToolMark tool="brand" />
        </span>
        <span>FileKit</span>
      </Link>
      <p>Built with curiosity and care by Ozlorien Labs.</p>
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

/** The marketing frame: header, page, footer. Tool routes use the app shell instead. */
function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader />
      {children}
      <AppFooter />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/en" replace />} />
      <Route
        path="/en"
        element={
          <SitePage>
            <HomePage />
          </SitePage>
        }
      />
      {coreTools.map((tool) => (
        <Route key={tool.id} path={tool.path} element={<ToolPage tool={tool} />} />
      ))}
      <Route
        path="/en/emojis"
        element={
          <SitePage>
            <Suspense fallback={<EmojiLoading />}>
              <EmojiPage />
            </Suspense>
          </SitePage>
        }
      />
      <Route
        path="*"
        element={
          <SitePage>
            <NotFoundPage />
          </SitePage>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
