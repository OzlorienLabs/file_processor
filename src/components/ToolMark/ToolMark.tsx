import { inkVar, marks, shapeAttributes, type MarkId } from './marks';

interface ToolMarkProps {
  /** `brand` for the FileKit sheet, otherwise the tool's own registration mark. */
  tool: MarkId;
  /**
   * Marks are decorative beside their own label. Pass a label where the mark stands alone,
   * and it becomes an `img` with that accessible name.
   */
  label?: string;
}

/**
 * One registration mark, drawn at the size of its parent. Inks come from the Broadsheet
 * custom properties so the mark follows the theme; the standalone favicon files in
 * `public/marks/` carry the same paths with literal hexes.
 */
export function ToolMark({ tool, label }: ToolMarkProps) {
  const mark = marks[tool];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.7}
      strokeLinecap={mark.strokeLinecap}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        overflow: mark.overflowVisible ? 'visible' : undefined,
      }}
    >
      {mark.shapes.map((shape, index) => {
        const attributes = shapeAttributes(shape, inkVar);
        const key = `${shape.kind}-${index}`;
        if (shape.kind === 'path') return <path key={key} {...attributes} />;
        if (shape.kind === 'circle') return <circle key={key} {...attributes} />;
        return <rect key={key} {...attributes} />;
      })}
    </svg>
  );
}
