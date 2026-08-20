import {
  ArrowRight,
  AudioLines,
  Check,
  FileInput,
  FileOutput,
  Files,
  ListCollapse,
  Minimize2,
  RefreshCw,
  ScanText,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { coreTools, type ToolDefinition } from '../app/tool-catalog';

const icons = {
  AudioLines,
  FileInput,
  FileOutput,
  Files,
  ListCollapse,
  Minimize2,
  RefreshCw,
  ScanText,
  Scissors,
};

function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = icons[tool.icon as keyof typeof icons];
  return (
    <Link className="tool-card" data-tone={tool.tone} data-testid="tool-card" to={tool.path}>
      <span className="tool-icon" aria-hidden="true">
        <Icon size={26} strokeWidth={1.8} />
      </span>
      <span className="tool-card-arrow" aria-hidden="true">
        <ArrowRight size={18} />
      </span>
      <strong>{tool.shortName}</strong>
      <span>{tool.description}</span>
      <small>
        {tool.processing === 'browser' ? 'Runs locally' : 'Local + your AI provider'}
      </small>
    </Link>
  );
}

export function HomePage() {
  return (
    <main id="main-content">
      <section className="home-hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">No accounts. No file storage.</p>
            <h1>Useful tools for everyday files.</h1>
            <p className="lede">
              Merge, convert, compress, read, and summarize without handing your
              files to a mystery server. Most work happens right in this browser.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#tools">
                Pick a tool <ArrowRight aria-hidden="true" size={18} />
              </a>
              <Link className="text-link" to="/en/emojis">
                Browse every emoji <Sparkles aria-hidden="true" size={17} />
              </Link>
            </div>
          </div>
          <aside className="privacy-card" id="privacy" aria-labelledby="privacy-title">
            <ShieldCheck aria-hidden="true" size={28} />
            <div>
              <h2 id="privacy-title">Private by default</h2>
              <p>
                Local tools never upload your file. AI tools clearly ask before sending
                extracted content to the provider whose key you supply.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="shell page-section" id="tools" aria-labelledby="tools-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Online tools for your files</p>
            <h2 id="tools-title">Choose what you need to get done</h2>
          </div>
          <p>Nine focused tools. No dashboard to learn.</p>
        </div>
        <div className="tool-grid">
          {coreTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <section className="process-section">
        <div className="shell process-grid">
          <div className="process-intro">
            <p className="eyebrow">A short path to done</p>
            <h2>Three steps. Then the file is yours.</h2>
            <p>
              Every tool keeps the same clear rhythm, with its processing location
              shown before you begin.
            </p>
          </div>
          <ol className="process-list">
            <li>
              <span><Upload aria-hidden="true" /></span>
              <div><strong>Choose</strong><p>Add only the file or files the task needs.</p></div>
            </li>
            <li>
              <span><Check aria-hidden="true" /></span>
              <div><strong>Adjust</strong><p>Pick page ranges, quality, output, or model.</p></div>
            </li>
            <li>
              <span><FileOutput aria-hidden="true" /></span>
              <div><strong>Download</strong><p>Save the finished result immediately.</p></div>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}
