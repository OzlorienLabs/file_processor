import { describe, expect, it } from 'vitest';

import {
  createGraphCollection,
  createGraphDraftStore,
  createSavedGraph,
  fileStem,
  markdownFence,
  suggestGraphName,
} from './graphviz-diagrams';
import { defaultGraphvizSample, graphvizSamples, nodeShapes } from './graphviz-samples';

describe('graphviz diagram helpers', () => {
  it('suggests names from the graph ID or its kind', () => {
    expect(suggestGraphName('digraph Pipeline {\n a -> b }')).toBe('Pipeline');
    expect(suggestGraphName('strict graph "My network" { a -- b }')).toBe('My network');
    expect(suggestGraphName('// header\n/* block */\n# line\ndigraph { a }')).toBe('Directed graph');
    expect(suggestGraphName('GRAPH { a }')).toBe('Undirected graph');
    expect(suggestGraphName('graph 42 { a }')).toBe('42');
    expect(suggestGraphName('not dot at all')).toBe('Graph');
    expect(suggestGraphName('')).toBe('Graph');
  });

  it('creates saved graphs with a trimmed or suggested name and an engine', () => {
    const graph = createSavedGraph('  Mine ', 'digraph { a }', 'twopi');
    expect(graph).toMatchObject({ name: 'Mine', engine: 'twopi' });
    expect(createSavedGraph('   ', 'digraph Flow { a }')).toMatchObject({ name: 'Flow', engine: 'dot' });
  });

  it('wraps code in a dot fence and makes safe file stems', () => {
    expect(markdownFence('  digraph { a }\n')).toBe('```dot\ndigraph { a }\n```\n');
    expect(fileStem('My graph: v2!')).toBe('my-graph-v2');
    expect(fileStem('***')).toBe('graph');
  });

  it('persists graphs and the draft under versioned keys, defaulting old records to dot', () => {
    const collection = createGraphCollection();
    expect(collection.key).toBe('filekit.graphviz.v1');
    collection.upsert(createSavedGraph('one', 'graph { a }', 'circo'));
    expect(collection.list()[0].engine).toBe('circo');
    expect(collection.importJson(JSON.stringify([{ id: 'x', createdAt: 1, updatedAt: 1, name: 'Old', code: 'graph {}' }]))).toMatchObject({
      imported: 1,
    });
    expect(collection.list().find((graph) => graph.id === 'x')?.engine).toBe('dot');

    const draft = createGraphDraftStore();
    expect(draft.load()).toEqual({ code: defaultGraphvizSample.code, engine: defaultGraphvizSample.engine });
    draft.save({ code: 'graph { a }', engine: 'fdp' });
    expect(draft.load()).toEqual({ code: 'graph { a }', engine: 'fdp' });
  });

  it('ships a sample for every layout engine family and every node shape', () => {
    expect(new Set(graphvizSamples.map((sample) => sample.id)).size).toBe(graphvizSamples.length);
    expect(new Set(graphvizSamples.map((sample) => sample.engine))).toEqual(
      new Set(['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork']),
    );
    const shapes = graphvizSamples.find((sample) => sample.id === 'shapes')!.code;
    for (const shape of nodeShapes.flat()) expect(shapes).toContain(`[shape=${shape}`);
  });
});
