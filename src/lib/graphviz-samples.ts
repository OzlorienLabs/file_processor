import type { LayoutEngine } from './graphviz-render';

/** Graphviz's full polygon-based shape list, in the order of graphviz.org/doc/info/shapes.html. */
export const nodeShapes = [
  ['box', 'polygon', 'ellipse', 'oval', 'circle', 'point', 'egg', 'triangle'],
  ['plaintext', 'plain', 'diamond', 'trapezium', 'parallelogram', 'house', 'pentagon', 'hexagon'],
  ['septagon', 'octagon', 'doublecircle', 'doubleoctagon', 'tripleoctagon', 'invtriangle', 'invtrapezium', 'invhouse'],
  ['Mdiamond', 'Msquare', 'Mcircle', 'rect', 'square', 'star', 'underline', 'cylinder'],
  ['note', 'tab', 'folder', 'box3d', 'component', 'promoter', 'cds', 'terminator'],
  ['utr', 'primersite', 'restrictionsite', 'fivepoverhang', 'threepoverhang', 'noverhang', 'assembly', 'signature'],
  ['insulator', 'ribosite', 'rnastab', 'proteasesite', 'proteinstab', 'rpromoter', 'rarrow', 'larrow', 'lpromoter'],
] as const;

function shapesSample(): string {
  const rows = nodeShapes.map(
    (row) => `  { rank=same; ${row.map((shape) => `${shape} [shape=${shape}${shape === 'point' ? ', xlabel=point' : ''}]`).join('; ')} }`,
  );
  return [
    'digraph Shapes {',
    '  nodesep=0.3',
    '  node [fontname="Helvetica", fontsize=10, style=filled, fillcolor="#e9f8ff"]',
    '  edge [style=invis]',
    ...rows,
    `  ${nodeShapes.map((row) => row[0]).join(' -> ')}`,
    '}',
  ].join('\n');
}

export interface GraphvizSample {
  id: string;
  label: string;
  engine: LayoutEngine;
  code: string;
}

/**
 * One sample per layout engine plus the DOT features graphviz.org's gallery leans on:
 * clusters, records and ports, HTML-like labels, node shapes, arrowheads, colour and
 * gradient fills, rank constraints, strict graphs and pinned positions.
 */
export const graphvizSamples: GraphvizSample[] = [
  {
    id: 'digraph',
    label: 'Directed graph (dot)',
    engine: 'dot',
    code: `digraph FileKit {
  node [shape=box, style="rounded,filled", fillcolor="#e9f8ff", color="#0088b0", fontname="Helvetica"]
  edge [color="#201e1d"]

  drop    [label="Drop a file"]
  ai      [label="Needs AI?", shape=diamond, style=filled, fillcolor="#fff1f4", color="#d6006c"]
  local   [label="Process in the browser"]
  remote  [label="Send only what is needed"]
  done    [label="Download the result", shape=box, peripheries=2]

  drop -> ai
  ai -> local  [label="no"]
  ai -> remote [label="yes"]
  local -> done
  remote -> done
}`,
  },
  {
    id: 'undirected',
    label: 'Undirected graph (neato)',
    engine: 'neato',
    code: `graph Network {
  node [shape=circle, style=filled, fillcolor="#ffffff", fontname="Helvetica"]
  edge [len=1.6]

  router [shape=doublecircle, fillcolor="#e9f8ff"]
  router -- { laptop phone printer nas }
  nas -- backup [style=dashed]
  laptop -- phone [label="bluetooth", fontsize=10]
}`,
  },
  {
    id: 'clusters',
    label: 'Clusters (dot)',
    engine: 'dot',
    code: `digraph Clusters {
  compound=true
  node [shape=box, fontname="Helvetica"]

  subgraph cluster_browser {
    label="Browser"
    style=filled
    color="#e9f8ff"
    ui -> worker -> wasm
  }

  subgraph cluster_edge {
    label="Edge function"
    style=dashed
    proxy -> provider
  }

  ui -> proxy [lhead=cluster_edge, label="AI only"]
  provider -> ui [ltail=cluster_edge, style=dotted]
}`,
  },
  {
    id: 'records',
    label: 'Records and ports (dot)',
    engine: 'dot',
    code: `digraph Structs {
  node [shape=record, fontname="Courier"]

  list  [label="<head> head | <tail> tail"]
  n1    [label="{ <v> 7 | <next> next }"]
  n2    [label="{ <v> 12 | <next> next }"]
  n3    [label="{ <v> 42 | <next> null }"]
  table [label="{ id | name | size } | { 1 | a.pdf | 2 MB } | { 2 | b.png | 340 kB }"]

  list:head -> n1:v
  n1:next:e -> n2:v:w
  n2:next:e -> n3:v:w
  list:tail -> n3:v [style=dashed]
}`,
  },
  {
    id: 'html',
    label: 'HTML-like labels (dot)',
    engine: 'dot',
    code: `digraph HtmlLabels {
  node [shape=plain, fontname="Helvetica"]

  user [label=<
    <table border="0" cellborder="1" cellspacing="0" cellpadding="6">
      <tr><td bgcolor="#0088b0"><font color="white"><b>User</b></font></td></tr>
      <tr><td align="left" port="id">id: uuid</td></tr>
      <tr><td align="left">email: text</td></tr>
    </table>>]

  file [label=<
    <table border="0" cellborder="1" cellspacing="0" cellpadding="6">
      <tr><td bgcolor="#d6006c"><font color="white"><b>File</b></font></td></tr>
      <tr><td align="left" port="owner">owner_id: uuid</td></tr>
      <tr><td align="left"><i>name</i>: text</td></tr>
    </table>>]

  file:owner -> user:id [arrowhead=crow, arrowtail=tee, dir=both]
}`,
  },
  {
    id: 'fsm',
    label: 'Finite state machine (dot)',
    engine: 'dot',
    code: `digraph FSM {
  rankdir=LR
  node [shape=doublecircle] idle done
  node [shape=circle]

  start [shape=point, width=0.15]
  start -> idle
  idle -> working [label="run"]
  working -> working [label="progress"]
  working -> done [label="success"]
  working -> error [label="fail"]
  working -> idle [label="cancel"]
  error -> idle [label="retry"]
}`,
  },
  {
    id: 'uml',
    label: 'UML class diagram (dot)',
    engine: 'dot',
    code: `digraph UML {
  rankdir=BT
  node [shape=record, fontname="Helvetica", fontsize=11]
  edge [arrowhead=empty]

  Tool  [label="{Tool|+ id: string\\l+ path: string\\l|+ render(): Element\\l}"]
  Mermaid [label="{MermaidTool|+ code: string\\l|+ exportSvg(): Blob\\l}"]
  Graphviz [label="{GraphvizTool|+ code: string\\l+ engine: Layout\\l|+ exportPng(): Blob\\l}"]

  Mermaid -> Tool
  Graphviz -> Tool
  Graphviz -> Mermaid [arrowhead=vee, style=dashed, label="reuses export"]
}`,
  },
  {
    id: 'er',
    label: 'Entity relationship (neato)',
    engine: 'neato',
    code: `graph ER {
  layout=neato
  overlap=false
  node [fontname="Helvetica"]

  node [shape=box] course institute student
  node [shape=ellipse] name0 [label="name"] name1 [label="name"] name2 [label="name"] code grade number
  node [shape=diamond, style=filled, color=lightgrey] "C-I" "S-C" "S-I"

  name0 -- course
  code -- course
  course -- "C-I" [label="n", len=1.0]
  "C-I" -- institute [label="1", len=1.0]
  institute -- name1
  institute -- "S-I" [label="1", len=1.0]
  "S-I" -- student [label="n", len=1.0]
  student -- grade
  student -- name2
  student -- number
  student -- "S-C" [label="m", len=1.0]
  "S-C" -- course [label="n", len=1.0]
}`,
  },
  {
    id: 'radial',
    label: 'Radial layout (twopi)',
    engine: 'twopi',
    code: `digraph Radial {
  ranksep=1.4
  root=FileKit
  node [shape=circle, style=filled, fillcolor="#e9f8ff", fontname="Helvetica", fontsize=10, fixedsize=true, width=0.9]

  FileKit [fillcolor="#d6006c", fontcolor=white, width=1.1]
  FileKit -> { Files Create }
  Files -> { Merge Split Compress Convert OCR }
  Create -> { Mermaid Graphviz Diagram Notepad Markdown }
}`,
  },
  {
    id: 'circular',
    label: 'Circular layout (circo)',
    engine: 'circo',
    code: `graph Ring {
  node [shape=circle, style=filled, fillcolor="#ffffff", fontname="Helvetica"]
  a -- b -- c -- d -- e -- f -- a
  a -- d
  g -- h -- i -- g
  f -- g
}`,
  },
  {
    id: 'fdp',
    label: 'Force-directed clusters (fdp)',
    engine: 'fdp',
    code: `graph Services {
  node [shape=box, style=rounded, fontname="Helvetica"]

  subgraph cluster_a {
    label="Cluster A"
    a1 -- a2 -- a3 -- a1
  }
  subgraph cluster_b {
    label="Cluster B"
    b1 -- b2
    b2 -- b3
  }
  a3 -- b1
  a2 -- gateway -- b3
}`,
  },
  {
    id: 'sfdp',
    label: 'Large graph (sfdp)',
    engine: 'sfdp',
    code: `graph Mesh {
  // sfdp is the multiscale engine for big graphs; K sets the ideal edge length.
  K=0.6
  node [shape=circle, label="", width=0.22, fixedsize=true, style=filled, fillcolor="#99e0ff", color="#0088b0"]
  edge [color="#605d5d"]

  hub [label="hub", width=0.6, fillcolor="#d6006c", fontcolor=white, fontname="Helvetica"]
  hub -- { a b c d e f g h }
  a -- { a1 a2 a3 a4 }
  b -- { b1 b2 b3 b4 }
  c -- { c1 c2 c3 c4 }
  d -- { d1 d2 d3 d4 }
  e -- { e1 e2 e3 e4 }
  f -- { f1 f2 f3 f4 }
  g -- { g1 g2 g3 g4 }
  h -- { h1 h2 h3 h4 }
  a1 -- b1
  c1 -- d1
  e1 -- f1
  g1 -- h1
}`,
  },
  {
    id: 'osage',
    label: 'Packed clusters (osage)',
    engine: 'osage',
    code: `graph Packing {
  pack=16
  node [shape=box, style=filled, fillcolor="#e9f8ff", fontname="Helvetica"]

  subgraph cluster_pdf {
    label="PDF tools"
    merge split compress
  }
  subgraph cluster_ai {
    label="AI tools"
    ocr summarize transcribe
  }
  subgraph cluster_editors {
    label="Editors"
    mermaid graphviz diagram notepad markdown snippets
  }
}`,
  },
  {
    id: 'patchwork',
    label: 'Tree map (patchwork)',
    engine: 'patchwork',
    code: `graph TreeMap {
  node [style=filled, fontname="Helvetica", fontcolor=white]

  subgraph cluster_images {
    label="Images"
    png  [area=40, fillcolor="#0088b0"]
    jpg  [area=25, fillcolor="#0088b0"]
    webp [area=10, fillcolor="#0088b0"]
  }
  subgraph cluster_docs {
    label="Documents"
    pdf  [area=30, fillcolor="#d6006c"]
    docx [area=15, fillcolor="#d6006c"]
    txt  [area=5,  fillcolor="#d6006c"]
  }
}`,
  },
  {
    id: 'ranks',
    label: 'Rank constraints (dot)',
    engine: 'dot',
    code: `digraph Timeline {
  node [shape=box, fontname="Helvetica"]
  { node [shape=plaintext, fontsize=14]
    2024 -> 2025 -> 2026 }

  { rank=same; 2024; spec; plan }
  { rank=same; 2025; merge; split; ocr }
  { rank=same; 2026; mermaid; graphviz }

  spec -> merge
  plan -> split
  plan -> ocr
  merge -> mermaid
  ocr -> graphviz
}`,
  },
  {
    id: 'shapes',
    label: 'Every node shape (dot)',
    engine: 'dot',
    code: shapesSample(),
  },
  {
    id: 'arrows',
    label: 'Arrowheads (dot)',
    engine: 'dot',
    code: `digraph Arrows {
  rankdir=LR
  node [shape=point]
  edge [fontname="Helvetica", fontsize=10]

  a1 -> b1 [arrowhead=normal, label="normal"]
  a2 -> b2 [arrowhead=inv, label="inv"]
  a3 -> b3 [arrowhead=dot, label="dot"]
  a4 -> b4 [arrowhead=odot, label="odot"]
  a5 -> b5 [arrowhead=diamond, label="diamond"]
  a6 -> b6 [arrowhead=ediamond, label="ediamond"]
  a7 -> b7 [arrowhead=box, label="box"]
  a8 -> b8 [arrowhead=crow, label="crow"]
  a9 -> b9 [arrowhead=tee, label="tee"]
  a10 -> b10 [arrowhead=vee, label="vee"]
  a11 -> b11 [arrowhead=curve, label="curve"]
  a12 -> b12 [arrowhead=icurve, label="icurve"]
  a13 -> b13 [arrowhead=none, label="none"]
  a14 -> b14 [arrowhead=lteeoldiamond, label="lteeoldiamond"]
  a15 -> b15 [dir=both, arrowtail=odiamond, arrowhead=onormal, label="both ends"]
}`,
  },
  {
    id: 'styles',
    label: 'Colours and gradients (dot)',
    engine: 'dot',
    code: `digraph Styles {
  bgcolor="white:#e9f8ff"
  gradientangle=90
  node [fontname="Helvetica", style=filled]

  linear  [fillcolor="#0088b0:#99e0ff", gradientangle=270, fontcolor=white]
  radial  [style=radial, fillcolor="white:#d6006c"]
  striped [shape=box, style=striped, fillcolor="#0088b0;0.3:#d6006c;0.3:#edbb00"]
  wedged  [shape=circle, style=wedged, fillcolor="#0088b0:#d6006c:#edbb00"]
  dashed  [style="dashed,filled", fillcolor=white]
  bold    [style="bold,filled", fillcolor=white, penwidth=3]

  linear -> radial [color="#0088b0:#d6006c", penwidth=2]
  radial -> striped [style=dashed]
  striped -> wedged [style=dotted]
  wedged -> dashed [style=bold, color="#d6006c"]
  dashed -> bold [arrowsize=2]
}`,
  },
  {
    id: 'strict',
    label: 'Strict graph (dot)',
    engine: 'dot',
    code: `strict digraph Dependencies {
  // A strict graph merges duplicate edges and drops self-loops.
  node [shape=box, fontname="Helvetica"]
  app -> ui
  app -> ui
  app -> lib
  ui -> lib
  lib -> lib
  lib -> wasm
}`,
  },
  {
    id: 'positions',
    label: 'Pinned positions (neato)',
    engine: 'neato',
    code: `graph Pinned {
  // "!" pins a node; units are inches unless notranslate/inputscale says otherwise.
  node [shape=circle, fontname="Helvetica", style=filled, fillcolor="#e9f8ff"]
  splines=true

  a [pos="0,0!"]
  b [pos="2,0!"]
  c [pos="2,2!"]
  d [pos="0,2!"]
  center [pos="1,1!", fillcolor="#d6006c", fontcolor=white]

  a -- b -- c -- d -- a
  center -- { a b c d }
}`,
  },
];

export const defaultGraphvizSample = graphvizSamples[0];
export const defaultGraphvizCode = defaultGraphvizSample.code;
