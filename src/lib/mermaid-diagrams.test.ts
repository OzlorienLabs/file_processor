import { describe, expect, it } from 'vitest';

import {
  createDiagramCollection,
  createDiagramDraftStore,
  createSavedDiagram,
  markdownFence,
  suggestDiagramName,
} from './mermaid-diagrams';
import { defaultMermaidCode, mermaidSamples } from './mermaid-samples';

describe('mermaid diagram helpers', () => {
  it('suggests names from the diagram type', () => {
    expect(suggestDiagramName('flowchart TD\n A-->B')).toBe('Flowchart');
    expect(suggestDiagramName('  stateDiagram-v2\n [*]-->A')).toBe('State diagram');
    expect(suggestDiagramName('sequenceDiagram')).toBe('Sequence diagram');
    expect(suggestDiagramName('weird stuff')).toBe('Diagram');
    expect(suggestDiagramName('')).toBe('Diagram');
  });

  it('creates saved diagrams with a trimmed or suggested name', () => {
    expect(createSavedDiagram('  My chart ', 'pie').name).toBe('My chart');
    expect(createSavedDiagram('   ', 'gantt\n title x').name).toBe('Gantt chart');
  });

  it('wraps code in a mermaid fence', () => {
    expect(markdownFence('  pie\n "a": 1 \n')).toBe('```mermaid\npie\n "a": 1\n```\n');
  });

  it('persists saved diagrams and the draft under versioned keys', () => {
    const collection = createDiagramCollection();
    expect(collection.key).toBe('filekit.mermaid.v1');
    collection.upsert(createSavedDiagram('one', 'pie'));
    expect(collection.list()).toHaveLength(1);

    const draft = createDiagramDraftStore();
    expect(draft.load()).toEqual({ code: defaultMermaidCode });
    draft.save({ code: 'pie' });
    expect(draft.load()).toEqual({ code: 'pie' });
  });

  it('ships samples for the common diagram kinds', () => {
    expect(mermaidSamples.map((sample) => sample.id)).toEqual(
      expect.arrayContaining(['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'git', 'mindmap']),
    );
    expect(new Set(mermaidSamples.map((sample) => sample.id)).size).toBe(mermaidSamples.length);
  });
});
