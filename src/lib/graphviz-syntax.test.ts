import { describe, expect, it } from 'vitest';

import { graphvizSamples } from './graphviz-samples';
import { tokenizeDot, type DotToken } from './graphviz-syntax';

const join = (tokens: (string | DotToken)[]) => tokens.map((token) => (typeof token === 'string' ? token : token.text)).join('');
const kinds = (code: string) =>
  tokenizeDot(code)
    .filter((token): token is DotToken => typeof token !== 'string')
    .map((token) => `${token.kind}:${token.text}`);

describe('tokenizeDot', () => {
  it('classifies comments, keywords, edges, attributes, strings, numbers and HTML labels', () => {
    expect(kinds('# pre\nstrict digraph G { // x\n a -> b [label=<<b>x</b>>, w=1.5] /* y */ "q\\"" -- 3 }')).toEqual([
      'comment:# pre',
      'keyword:strict',
      'keyword:digraph',
      'comment:// x',
      'edge:->',
      'attribute:label',
      'html:<<b>x</b>>',
      'attribute:w',
      'number:1.5',
      'comment:/* y */',
      'string:"q\\""',
      'edge:--',
      'number:3',
    ]);
    expect(kinds('SubGraph cluster_1 { Node [shape=box] }')).toEqual(['keyword:SubGraph', 'keyword:Node', 'attribute:shape']);
  });

  it('leaves stray angle brackets, unclosed labels and identifiers with digits as plain text', () => {
    expect(tokenizeDot('<')).toEqual(['<']);
    expect(tokenizeDot('')).toEqual([]);
    expect(kinds('a [l=<unclosed')).toEqual(['attribute:l']);
    expect(kinds('a1 <x> b2')).toEqual([]);
    expect(kinds('/* open comment')).toEqual(['comment:/* open comment']);
  });

  it('round-trips every sample exactly', () => {
    for (const sample of graphvizSamples) expect(join(tokenizeDot(sample.code)), sample.id).toBe(sample.code);
  });
});
