import { NavLink, Link } from 'react-router-dom';

import { toolsInCategory, type ToolCategory, type ToolDefinition } from '../../app/tool-catalog';
import { ToolMark } from '../ToolMark/ToolMark';

interface ToolRailProps {
  /** Names beside the marks (212px) or marks alone (62px). */
  labels: boolean;
  /** Null while the rail is locked to icons by viewport width. */
  onToggleLabels: (() => void) | null;
}

const groups: { category: ToolCategory; label: string }[] = [
  { category: 'files', label: 'Files' },
  { category: 'create', label: 'Create' },
];

function RailItem({ tool, labels }: { tool: ToolDefinition; labels: boolean }) {
  return (
    <NavLink className="rail-item ctl" to={tool.path} title={tool.name} data-category={tool.category}>
      <span className="rail-mark">
        <ToolMark tool={tool.id} />
      </span>
      {labels ? <span className="rail-name">{tool.shortName}</span> : null}
      {labels ? null : <span className="sr-only">{tool.shortName}</span>}
    </NavLink>
  );
}

/** The persistent tool rail. Every item is generated from the catalog. */
export function ToolRail({ labels, onToggleLabels }: ToolRailProps) {
  return (
    <nav className="tool-rail g2 scroll" data-labels={labels} aria-label="All tools">
      <Link className="rail-brand ctl" to="/en">
        <span className="rail-mark">
          <ToolMark tool="brand" />
        </span>
        {labels ? <strong>FileKit</strong> : <span className="sr-only">FileKit home</span>}
      </Link>

      {groups.map((group) => (
        <div className="rail-group" key={group.category}>
          {labels ? (
            <p className="rail-group-label" id={`rail-group-${group.category}`}>
              {group.label}
            </p>
          ) : null}
          <ul aria-label={labels ? undefined : group.label} aria-labelledby={labels ? `rail-group-${group.category}` : undefined}>
            {toolsInCategory(group.category).map((tool) => (
              <li key={tool.id}>
                <RailItem tool={tool} labels={labels} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {onToggleLabels ? (
        <button className="rail-collapse ctl" type="button" onClick={onToggleLabels}>
          <span className="rail-collapse-glyph" aria-hidden="true">
            {labels ? '«' : '»'}
          </span>
          {labels ? <span>Collapse rail</span> : <span className="sr-only">Expand rail</span>}
        </button>
      ) : null}
    </nav>
  );
}
