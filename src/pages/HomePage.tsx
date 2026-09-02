import { Link } from 'react-router-dom';

import { toolCounts, toolsInCategory, type ToolDefinition } from '../app/tool-catalog';
import { ToolMark } from '../components/ToolMark/ToolMark';
import { usePressLean } from '../hooks/usePressLean';

const whereItRuns: Record<ToolDefinition['processing'], string> = {
  browser: 'Runs locally',
  'browser-and-provider': 'Local + your AI provider',
  'browser-or-provider': 'On-device AI or your key',
};

function PlateHeadline({ text }: { text: string }) {
  const press = usePressLean();
  return (
    <span className="cmyk-head hero-plate" ref={press}>
      <span className="paper">{text}</span>
      <span className="plate plate-c" aria-hidden="true">
        {text}
      </span>
      <span className="plate plate-m" aria-hidden="true">
        {text}
      </span>
      <span className="plate plate-y" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

function PlateNumeral({ figure }: { figure: string }) {
  return (
    <span className="cmyk-num step-numeral">
      <span className="paper">{figure}</span>
      <span className="plate plate-c" aria-hidden="true">
        {figure}
      </span>
      <span className="plate plate-m" aria-hidden="true">
        {figure}
      </span>
      <span className="plate plate-y" aria-hidden="true">
        {figure}
      </span>
    </span>
  );
}

function ToolCard({ tool }: { tool: ToolDefinition }) {
  return (
    <Link className="tool-card g lift" data-category={tool.category} data-testid="tool-card" to={tool.path}>
      <span className="tool-icon">
        <ToolMark tool={tool.id} />
      </span>
      <span className="tool-card-arrow" aria-hidden="true">
        →
      </span>
      <strong>{tool.shortName}</strong>
      <span>{tool.description}</span>
      <small>{tool.storage === 'local' ? 'Saved in this browser' : whereItRuns[tool.processing]}</small>
    </Link>
  );
}

const steps = [
  { figure: '1', title: 'Choose', body: 'Drop in only the file the task needs.' },
  { figure: '2', title: 'Adjust', body: 'Set the range, the quality, the format, the model.' },
  { figure: '3', title: 'Download', body: 'Save the result. Nothing is kept on our side.' },
];

export function HomePage() {
  const counts = toolCounts();
  const fileTools = toolsInCategory('files');
  const createTools = toolsInCategory('create');

  return (
    <main id="main-content">
      <section className="home-hero" id="top">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow fu">No accounts · No uploads · Nothing left behind</p>
            <h1 className="fu d1">
              <span className="hero-line">Files in.</span>
              <PlateHeadline text="Result out." />
            </h1>
            <p className="lede fu d2">
              {counts.total} tools for the small jobs — convert, compress, merge, split, read,
              transcribe, draw, diff, write, keep code. The work happens in this browser, on this
              device, and then it is over.
            </p>
            <div className="hero-actions fu d3">
              <Link className="button button-primary" to={fileTools[0].path}>
                Start with a file
              </Link>
              <a className="button button-secondary g" href="#tools">
                See all {counts.total} tools
              </a>
            </div>
          </div>

          <aside className="privacy-card g fu d4" aria-labelledby="privacy-title">
            <h2 className="panel-label" id="privacy-title">
              Where the work runs
            </h2>
            <ul className="runs-list">
              <li>
                <span className="runs-dot" data-ink="cyan" aria-hidden="true" />
                <p>
                  <strong>{counts.local} tools never leave the tab.</strong> No request is made with
                  your file at all.
                </p>
              </li>
              <li>
                <span className="runs-dot" data-ink="magenta" aria-hidden="true" />
                <p>
                  <strong>{counts.ai} AI tools ask first,</strong> then use the provider key you
                  supply — held on this device, forgettable in one click.
                </p>
              </li>
              <li>
                <span className="runs-dot" data-ink="yellow" aria-hidden="true" />
                <p>
                  <strong>Editors save to this browser only,</strong> with export and clear on every
                  page.
                </p>
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="page-section shell" id="tools" aria-labelledby="tools-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">File operations</p>
            <h2 id="tools-title">Pick the job, not the app</h2>
          </div>
          <p>
            {fileTools.length} operations on the files you already have. Each one opens straight into
            its workspace.
          </p>
        </div>
        <div className="tool-grid">
          {fileTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <section className="page-section shell" id="create" aria-labelledby="create-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow eyebrow-2">Creation &amp; development</p>
            <h2 id="create-title">Editors that take the whole screen</h2>
          </div>
          <p>
            {counts.editors} full-bleed workspaces. Your work stays in this browser and follows you
            back.
          </p>
        </div>
        <div className="tool-grid">
          {createTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <section className="process-section shell" id="how" aria-labelledby="how-title">
        <div className="process-grid">
          <div className="process-intro">
            <p className="eyebrow">A short path to done</p>
            <h2 id="how-title">Three steps, then it is yours</h2>
            <p>
              Every tool keeps the same rhythm and says where it runs before you begin. Refresh the
              page and the file is gone from memory.
            </p>
          </div>
          <ol className="process-list">
            {steps.map((step) => (
              <li className="g" key={step.figure}>
                <PlateNumeral figure={step.figure} />
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
