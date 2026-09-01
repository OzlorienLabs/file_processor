/**
 * Where a tool's work happens:
 * - `browser`: everything runs on this device.
 * - `browser-and-provider`: local preparation, then the user's own AI provider key.
 * - `browser-or-provider`: on-device AI by default, a provider key as an alternative.
 */
export type ProcessingLocation = 'browser' | 'browser-and-provider' | 'browser-or-provider';

/** Home-page grouping: file operations versus writing/drawing/coding tools. */
export type ToolCategory = 'files' | 'create';

export type ToolId =
  | 'summarize'
  | 'merge'
  | 'ocr'
  | 'audio-to-text'
  | 'split'
  | 'compress'
  | 'word-to-pdf'
  | 'pdf-to-word'
  | 'convert'
  | 'diagram'
  | 'mermaid'
  | 'diff'
  | 'notepad'
  | 'markdown'
  | 'snippets'
  | 'snippet-generator';

export interface ToolDefinition {
  id: ToolId;
  path: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  tone: 'blue' | 'teal' | 'coral' | 'gold';
  processing: ProcessingLocation;
  category: ToolCategory;
  /** Editors get a wider workspace than the single-file tools. */
  layout?: 'wide';
  /** Set when the tool keeps user content in this browser's localStorage. */
  storage?: 'local';
  accept: string[];
  maxSize: string;
  howTo: string;
  steps: [string, string, string];
}

export const coreTools: ToolDefinition[] = [
  {
    id: 'convert',
    path: '/en/convert',
    name: 'Convert files',
    shortName: 'Convert',
    description: 'Change images, documents, PDFs, text, and audio into useful formats.',
    icon: 'RefreshCw',
    tone: 'blue',
    processing: 'browser',
    category: 'files',
    accept: ['Images', 'PDF', 'DOCX', 'TXT', 'Audio'],
    maxSize: 'Up to 100 MB',
    howTo: 'How to convert any file',
    steps: [
      'Choose a file from your device.',
      'Pick one of the compatible output formats.',
      'Convert in your browser and download the result.',
    ],
  },
  {
    id: 'compress',
    path: '/en/compress',
    name: 'Compress files',
    shortName: 'Compress',
    description: 'Reduce image or PDF size with a quality level you control.',
    icon: 'Minimize2',
    tone: 'teal',
    processing: 'browser',
    category: 'files',
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: 'Up to 100 MB',
    howTo: 'How to compress a file',
    steps: [
      'Add a PDF or supported image.',
      'Choose the balance between size and clarity.',
      'Compare the result and download the smaller file.',
    ],
  },
  {
    id: 'summarize',
    path: '/en/summarize',
    name: 'Summarize a file',
    shortName: 'Summarize',
    description: 'Turn a long document into a focused brief with your own AI key.',
    icon: 'ListCollapse',
    tone: 'coral',
    processing: 'browser-and-provider',
    category: 'files',
    accept: ['PDF', 'DOCX', 'TXT', 'Markdown'],
    maxSize: 'Up to 25 MB',
    howTo: 'How to summarize a file',
    steps: [
      'Add a PDF, Word, text, or Markdown file.',
      'Select a model, detail level, and provide your API key.',
      'Create, copy, or download the generated summary.',
    ],
  },
  {
    id: 'merge',
    path: '/en/merge',
    name: 'Merge PDF',
    shortName: 'Merge PDF',
    description: 'Combine PDFs and images in exactly the order you choose.',
    icon: 'Files',
    tone: 'gold',
    processing: 'browser',
    category: 'files',
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: '20 files · 150 MB',
    howTo: 'How to merge PDFs',
    steps: [
      'Add two or more PDFs or images.',
      'Reorder the files into the sequence you want.',
      'Merge them locally and download one PDF.',
    ],
  },
  {
    id: 'ocr',
    path: '/en/ocr',
    name: 'Extract text with OCR',
    shortName: 'OCR',
    description: 'Read printed text from scans, screenshots, images, and PDFs.',
    icon: 'ScanText',
    tone: 'blue',
    processing: 'browser',
    category: 'files',
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: '25 MB · 50 pages',
    howTo: 'How to extract text with OCR',
    steps: [
      'Choose an image or scanned PDF.',
      'Select the document language and start OCR.',
      'Edit, copy, or download the extracted text.',
    ],
  },
  {
    id: 'audio-to-text',
    path: '/en/audiototext',
    name: 'Audio to text',
    shortName: 'Audio to text',
    description: 'Transcribe interviews, voice notes, meetings, and recordings.',
    icon: 'AudioLines',
    tone: 'teal',
    processing: 'browser-and-provider',
    category: 'files',
    accept: ['MP3', 'M4A', 'WAV', 'WebM', 'OGG', 'FLAC'],
    maxSize: 'Up to 100 MB',
    howTo: 'How to convert audio to text',
    steps: [
      'Choose a supported recording from your device.',
      'Select a transcription model and language.',
      'Transcribe, review, and download the text.',
    ],
  },
  {
    id: 'split',
    path: '/en/split',
    name: 'Split PDF',
    shortName: 'Split PDF',
    description: 'Extract selected pages or break a PDF into smaller documents.',
    icon: 'Scissors',
    tone: 'coral',
    processing: 'browser',
    category: 'files',
    accept: ['PDF'],
    maxSize: '100 MB · 500 pages',
    howTo: 'How to split a PDF',
    steps: [
      'Add the PDF you want to separate.',
      'Choose every page, a range, or selected pages.',
      'Split locally and download a PDF or ZIP.',
    ],
  },
  {
    id: 'word-to-pdf',
    path: '/en/convert/word/pdf',
    name: 'Word to PDF',
    shortName: 'Word to PDF',
    description: 'Turn a DOCX document into an easy-to-share PDF.',
    icon: 'FileOutput',
    tone: 'gold',
    processing: 'browser',
    category: 'files',
    accept: ['DOCX'],
    maxSize: 'Up to 25 MB',
    howTo: 'How to convert Word to PDF',
    steps: [
      'Choose a Microsoft Word DOCX file.',
      'Review the browser-rendered document preview.',
      'Create and download the PDF file.',
    ],
  },
  {
    id: 'pdf-to-word',
    path: '/en/convert/pdf/word',
    name: 'PDF to Word',
    shortName: 'PDF to Word',
    description: 'Extract PDF text into a clean, editable DOCX document.',
    icon: 'FileInput',
    tone: 'blue',
    processing: 'browser',
    category: 'files',
    accept: ['PDF'],
    maxSize: '50 MB · 300 pages',
    howTo: 'How to convert PDF to Word',
    steps: [
      'Choose a text-based PDF document.',
      'Extract its pages into editable paragraphs.',
      'Download the result as a Word DOCX file.',
    ],
  },
  {
    id: 'notepad',
    path: '/en/notepad',
    name: 'Notepad',
    shortName: 'Notepad',
    description: 'Write notes that stay in this browser, with Markdown and HTML preview.',
    icon: 'NotebookPen',
    tone: 'gold',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Plain text', 'Markdown', 'HTML'],
    maxSize: 'Saved in this browser',
    howTo: 'How to keep notes in your browser',
    steps: [
      'Start a note; it saves itself as you type.',
      'Switch between plain, Markdown, and HTML preview.',
      'Export one note or every note whenever you need them.',
    ],
  },
  {
    id: 'markdown',
    path: '/en/markdown',
    name: 'Markdown previewer',
    shortName: 'Markdown preview',
    description: 'Write Markdown on one side and see the rendered page on the other.',
    icon: 'BookOpenText',
    tone: 'blue',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Markdown', 'GFM tables', 'Task lists'],
    maxSize: 'Draft saved in this browser',
    howTo: 'How to preview Markdown live',
    steps: [
      'Type or paste Markdown into the editor.',
      'Watch the preview update as you write.',
      'Copy the HTML or download the Markdown file.',
    ],
  },
  {
    id: 'diff',
    path: '/en/diff',
    name: 'Diff checker',
    shortName: 'Diff checker',
    description: 'Compare two texts or files and see every changed line and character.',
    icon: 'GitCompareArrows',
    tone: 'teal',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Text', 'Code', 'JSON', 'CSV'],
    maxSize: 'Up to 5 MB each',
    howTo: 'How to compare two files',
    steps: [
      'Paste or upload the original and the changed text.',
      'Find the differences in side-by-side or unified view.',
      'Step through changes or download a patch file.',
    ],
  },
  {
    id: 'diagram',
    path: '/en/diagram',
    name: 'Diagram creator',
    shortName: 'Diagram',
    description: 'Sketch whiteboard-style diagrams with shapes, arrows, and text.',
    icon: 'PenTool',
    tone: 'coral',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Shapes', 'Arrows', 'Text', 'Images'],
    maxSize: 'Saved in this browser',
    howTo: 'How to draw a diagram',
    steps: [
      'Pick a shape, arrow, or text tool and start drawing.',
      'Your canvas saves itself in this browser as you work.',
      'Export the diagram as PNG, SVG, or an editable file.',
    ],
  },
  {
    id: 'mermaid',
    path: '/en/mermaid',
    name: 'Mermaid editor',
    shortName: 'Mermaid',
    description: 'Turn Mermaid text into flowcharts, sequence diagrams, and more.',
    icon: 'Workflow',
    tone: 'blue',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Flowchart', 'Sequence', 'Class', 'Gantt', 'Pie'],
    maxSize: 'Saved in this browser',
    howTo: 'How to generate a Mermaid diagram',
    steps: [
      'Write Mermaid syntax or start from a sample.',
      'The preview updates live as you type.',
      'Save the diagram here or export it as SVG or PNG.',
    ],
  },
  {
    id: 'snippets',
    path: '/en/snippets',
    name: 'Code snippets',
    shortName: 'Snippets',
    description: 'Capture code snippets with tags and syntax highlighting, saved locally.',
    icon: 'Braces',
    tone: 'teal',
    processing: 'browser',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['30+ languages', 'Tags', 'Search'],
    maxSize: 'Saved in this browser',
    howTo: 'How to save a code snippet',
    steps: [
      'Paste code, name it, and pick a language and tags.',
      'Search and filter your snippets any time.',
      'Copy, download, or export the whole collection.',
    ],
  },
  {
    id: 'snippet-generator',
    path: '/en/snippet-generator',
    name: 'Snippet generator',
    shortName: 'Snippet generator',
    description: 'Describe the code you need and generate it with on-device or your own AI.',
    icon: 'WandSparkles',
    tone: 'coral',
    processing: 'browser-or-provider',
    category: 'create',
    layout: 'wide',
    storage: 'local',
    accept: ['Chrome built-in AI', 'OpenAI', 'Anthropic', 'Gemini'],
    maxSize: 'History saved in this browser',
    howTo: 'How to generate a code snippet',
    steps: [
      'Describe the snippet and choose a language.',
      'Generate with Chrome\'s on-device model or your provider key.',
      'Copy it, save it to your snippets, or find it later in history.',
    ],
  },
];

export function getToolByPath(path: string): ToolDefinition | undefined {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return coreTools.find((tool) => tool.path === normalized);
}

export function toolsInCategory(category: ToolCategory): ToolDefinition[] {
  return coreTools.filter((tool) => tool.category === category);
}
