export type ProcessingLocation = 'browser' | 'browser-and-provider';

export type ToolId =
  | 'summarize'
  | 'merge'
  | 'ocr'
  | 'audio-to-text'
  | 'split'
  | 'compress'
  | 'word-to-pdf'
  | 'pdf-to-word'
  | 'convert';

export interface ToolDefinition {
  id: ToolId;
  path: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  tone: 'blue' | 'teal' | 'coral' | 'gold';
  processing: ProcessingLocation;
  accept: string[];
  maxSize: string;
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
    accept: ['Images', 'PDF', 'DOCX', 'TXT', 'Audio'],
    maxSize: 'Up to 100 MB',
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
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: 'Up to 100 MB',
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
    accept: ['PDF', 'DOCX', 'TXT', 'Markdown'],
    maxSize: 'Up to 25 MB',
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
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: '20 files · 150 MB',
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
    accept: ['PDF', 'PNG', 'JPG', 'WebP'],
    maxSize: '25 MB · 50 pages',
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
    accept: ['MP3', 'M4A', 'WAV', 'WebM', 'OGG', 'FLAC'],
    maxSize: 'Up to 100 MB',
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
    accept: ['PDF'],
    maxSize: '100 MB · 500 pages',
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
    accept: ['DOCX'],
    maxSize: 'Up to 25 MB',
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
    accept: ['PDF'],
    maxSize: '50 MB · 300 pages',
    steps: [
      'Choose a text-based PDF document.',
      'Extract its pages into editable paragraphs.',
      'Download the result as a Word DOCX file.',
    ],
  },
];

export function getToolByPath(path: string): ToolDefinition | undefined {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return coreTools.find((tool) => tool.path === normalized);
}
