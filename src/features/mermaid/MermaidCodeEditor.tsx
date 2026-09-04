import { useRef, type ChangeEvent, type ReactNode, type UIEvent } from 'react';

interface MermaidCodeEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Regex to tokenize Mermaid syntax for colorful rendering
const TOKEN_REGEX =
  /(%%[^\n]*)|("(?:[^"\\]|\\.)*")|(\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|sankey-beta|packet-beta|kanban|block-beta|subgraph|end|direction|participant|actor|activate|deactivate|loop|alt|else|opt|par|critical|break|rect|note|autonumber|title|classDef|class|style|click|linkStyle|TB|TD|BT|RL|LR|showData)\b)|(-->|---|-.->|-.-|==>|===|--o|--x|->>|-->>|<<--|<-.|->|<--|:::)|(\[[^\]\n]*\]|\([^)\n]*\)|\{[^}\n]*\})|(\b\d+(?:\.\d+)?\b)/g;

function highlightMermaidSyntax(code: string): ReactNode[] {
  if (!code) return [];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }
    const [
      fullMatch,
      comment,
      stringLit,
      keyword,
      arrow,
      nodeLabel,
    ] = match;

    const key = `${match.index}-${fullMatch}`;
    if (comment) {
      nodes.push(<span key={key} className="mm-comment">{fullMatch}</span>);
    } else if (stringLit) {
      nodes.push(<span key={key} className="mm-string">{fullMatch}</span>);
    } else if (keyword) {
      nodes.push(<span key={key} className="mm-keyword">{fullMatch}</span>);
    } else if (arrow) {
      nodes.push(<span key={key} className="mm-arrow">{fullMatch}</span>);
    } else if (nodeLabel) {
      nodes.push(<span key={key} className="mm-node">{fullMatch}</span>);
    } else {
      nodes.push(<span key={key} className="mm-number">{fullMatch}</span>);
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }

  return nodes;
}

export function MermaidCodeEditor({
  id = 'mermaid-code',
  value,
  onChange,
  placeholder = 'flowchart TD\n  A --> B',
  disabled = false,
}: MermaidCodeEditorProps) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="mermaid-source-box">
      <pre
        ref={highlightRef}
        className="mermaid-highlight-layer scroll"
        aria-hidden="true"
      >
        <code>{highlightMermaidSyntax(value)}{value.endsWith('\n') ? ' ' : ''}</code>
      </pre>
      <textarea
        ref={textareaRef}
        className="mermaid-textarea scroll"
        id={id}
        aria-label="Mermaid code"
        value={value}
        disabled={disabled}
        spellCheck={false}
        placeholder={placeholder}
        onScroll={handleScroll}
        onChange={handleChange}
      />
    </div>
  );
}
