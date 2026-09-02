import { ArrowRight, Check, FileOutput, ShieldCheck, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

import { coreTools, toolsInCategory, type ToolDefinition } from '../app/tool-catalog';
import { ToolMark } from '../components/ToolMark/ToolMark';


const processingLabels: Record<ToolDefinition['processing'], string> = {
  browser: 'Runs locally',
  'browser-and-provider': 'Local + your AI provider',
  'browser-or-provider': 'On-device AI or your provider',
};

function ToolCard({ tool }: { tool: ToolDefinition }) {
  return (
    <Link className="tool-card g lift" data-category={tool.category} data-testid="tool-card" to={tool.path}>
      <span className="tool-icon">
        <ToolMark tool={tool.id} />
      </span>
      <span className="tool-card-arrow" aria-hidden="true">
        <ArrowRight size={18} />
      </span>
      <strong>{tool.shortName}</strong>
      <span>{tool.description}</span>
      <small>{tool.storage === 'local' ? `${processingLabels[tool.processing]} · saved here` : processingLabels[tool.processing]}</small>
    </Link>
  );
}

export function HomePage() {
  const fileTools = toolsInCategory('files');
  const createTools = toolsInCategory('create');

  return (
    <main id="main-content">
      <section className="home-hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">No accounts. No file storage.</p>
            <h1>Useful tools for everyday files.</h1>
            <p className="lede">
              Merge, convert, compress, read, and summarize files, then draw, write, diff, and
              keep code snippets, without handing anything to a mystery server. The work happens
              right in this browser.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#tools">
                Pick a tool <ArrowRight aria-hidden="true" size={18} />
              </a>
            </div>
          </div>
          <aside className="privacy-card g" id="privacy" aria-labelledby="privacy-title">
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
          <p>{coreTools.length} focused tools. No dashboard to learn.</p>
        </div>
        <div className="tool-grid">
          {fileTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <section className="shell page-section create-section" id="create" aria-labelledby="create-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Draw, write, and code</p>
            <h2 id="create-title">Editors that remember your work</h2>
          </div>
          <p>Saved in this browser's local storage only. Export or clear it whenever you like.</p>
        </div>
        <div className="tool-grid">
          {createTools.map((tool) => (
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
            <li className="g">
              <span><Upload aria-hidden="true" /></span>
              <div><strong>Choose</strong><p>Add only the file or files the task needs.</p></div>
            </li>
            <li className="g">
              <span><Check aria-hidden="true" /></span>
              <div><strong>Adjust</strong><p>Pick page ranges, quality, output, or model.</p></div>
            </li>
            <li className="g">
              <span><FileOutput aria-hidden="true" /></span>
              <div><strong>Download</strong><p>Save the finished result immediately.</p></div>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}
