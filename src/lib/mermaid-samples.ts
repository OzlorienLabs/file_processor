export interface MermaidSample {
  id: string;
  label: string;
  code: string;
}

export const mermaidSamples: MermaidSample[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: `flowchart TD
  A[Drop a file] --> B{Needs AI?}
  B -- No --> C[Process in the browser]
  B -- Yes --> D[Send only what is needed]
  C --> E[Download the result]
  D --> E`,
  },
  {
    id: 'sequence',
    label: 'Sequence diagram',
    code: `sequenceDiagram
  participant U as User
  participant B as Browser
  participant P as Provider
  U->>B: Paste text
  B->>B: Validate locally
  B->>P: Prompt with own key
  P-->>B: Snippet
  B-->>U: Show and save locally`,
  },
  {
    id: 'class',
    label: 'Class diagram',
    code: `classDiagram
  class Note {
    +string title
    +string body
    +NoteMode mode
    +export()
  }
  class Snippet {
    +string language
    +string[] tags
    +copy()
  }
  StoredRecord <|-- Note
  StoredRecord <|-- Snippet`,
  },
  {
    id: 'state',
    label: 'State diagram',
    code: `stateDiagram-v2
  [*] --> Idle
  Idle --> Working: start
  Working --> Success: done
  Working --> Error: failed
  Working --> Idle: cancel
  Success --> Idle: reset
  Error --> Idle: retry`,
  },
  {
    id: 'er',
    label: 'Entity relationship',
    code: `erDiagram
  USER ||--o{ NOTE : writes
  USER ||--o{ SNIPPET : saves
  SNIPPET }o--o{ TAG : labelled
  NOTE {
    string id
    string title
    string mode
  }`,
  },
  {
    id: 'gantt',
    label: 'Gantt chart',
    code: `gantt
  title Release plan
  dateFormat  YYYY-MM-DD
  section Build
  Editors           :done,    a1, 2026-09-01, 3d
  Diagram tools     :active,  a2, after a1, 2d
  section Ship
  Verify and audit  :         a3, after a2, 1d
  Release           :milestone, after a3, 0d`,
  },
  {
    id: 'pie',
    label: 'Pie chart',
    code: `pie showData
  title Where processing happens
  "In the browser" : 14
  "Browser + provider key" : 2`,
  },
  {
    id: 'git',
    label: 'Git graph',
    code: `gitGraph
  commit id: "foundation"
  branch feature
  commit id: "diff tool"
  commit id: "notepad"
  checkout main
  merge feature
  commit id: "release"`,
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    code: `mindmap
  root((FileKit))
    Files
      Merge
      Split
      Convert
    Create
      Notes
      Diagrams
      Snippets`,
  },
];

export const defaultMermaidCode = mermaidSamples[0].code;
