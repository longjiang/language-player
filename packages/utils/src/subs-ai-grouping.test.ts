import { describe, expect, it } from 'vitest';
import type { SubsSearchVideo } from '@langplayer/shared';
import {
  AI_ANALYZE_LIMIT,
  buildAiOrderedVideos,
  buildAiPayload,
  buildAiPrompt,
  parseAiResponse,
} from './subs-ai-grouping';

function video(id: number, line: string): SubsSearchVideo {
  return { id, title: `v${id}`, youtube_id: `y${id}`, subs_l2: [{ starttime: 0, line }], matchLineIndex: 0 };
}

describe('buildAiPayload', () => {
  it('emits a two-column CSV with the header and quoted lines', () => {
    const payload = buildAiPayload([video(20418, '今未練なんかこれっぽっちも無い')]);
    expect(payload).toBe('id,"line"\n20418,"今未練なんかこれっぽっちも無い"');
  });

  it('escapes quotes, backslashes, and newlines inside the quoted field', () => {
    const payload = buildAiPayload([video(1, 'say "hi"\nnext\\row')]);
    // The record occupies one physical row: literal `\n` and `\\` sequences
    // (two chars each) for the embedded newline and backslash.
    expect(payload).toBe('id,"line"\n1,"say ""hi""\\nnext\\\\row"');
  });

  it('caps the rows at AI_ANALYZE_LIMIT', () => {
    const many = Array.from({ length: 60 }, (_, i) => video(i + 1, `line ${i}`));
    const payload = buildAiPayload(many);
    expect(payload.split('\n')).toHaveLength(AI_ANALYZE_LIMIT + 1);
  });
});

describe('buildAiPrompt', () => {
  it('includes the prose, payload, and strict-JSON schema', () => {
    const prompt = buildAiPrompt({
      prose: 'Analyze 2 lines for っぽっち.',
      lines: 'id,"line"\n1,"hi"',
      l1Name: 'English',
      l2Name: 'Japanese',
      term: 'っぽっち',
    });
    expect(prompt).toContain('Analyze 2 lines for っぽっち.');
    expect(prompt).toContain('id,"line"\n1,"hi"');
    expect(prompt).toContain('"heading": "<meaning in English>"');
    expect(prompt).toContain('written in Japanese');
  });
});

describe('parseAiResponse', () => {
  it('parses a clean response with patterns and other ids', () => {
    const result = parseAiResponse(
      '{"patterns": [{"heading": "Not even a little", "pattern": "noun + っぽっち", "video_ids": [1, 2]}], "other_ids": [3]}',
    );
    expect(result).not.toBeNull();
    expect(result!.patterns).toHaveLength(1);
    expect(result!.patterns[0]!.videoIds).toEqual([1, 2]);
    expect(result!.otherIds).toEqual([3]);
  });

  it('tolerates markdown fences and trailing garbage after the object', () => {
    const result = parseAiResponse('```json\n{"patterns": [{"heading": "A", "video_ids": [1]}], "other_ids": [2]}\n``` trailing junk');
    expect(result).not.toBeNull();
    expect(result!.patterns[0]!.videoIds).toEqual([1]);
  });

  it('repairs unescaped quotes inside string values', () => {
    const result = parseAiResponse(
      '{"patterns": [{"heading": "表示"纠缠的"", "video_ids": [1]}], "other_ids": []}',
    );
    expect(result).not.toBeNull();
    expect(result!.patterns[0]!.heading).toBe('表示"纠缠的"');
  });

  it('strips stray punctuation glued onto ids', () => {
    const result = parseAiResponse('{"patterns": [], "other_ids": [700000268?]}');
    expect(result!.otherIds).toEqual([700000268]);
  });

  it('drops hallucinated ids not in the input and dedupes across groups', () => {
    const result = parseAiResponse(
      '{"patterns": [{"heading": "A", "video_ids": [1, 999]}, {"heading": "B", "video_ids": [1, 2]}], "other_ids": [2, 3]}',
    );
    const ordered = buildAiOrderedVideos(result!, [video(1, 'a'), video(2, 'b'), video(3, 'c'), video(4, 'd')], [video(1, 'a'), video(2, 'b'), video(3, 'c'), video(4, 'd')]);
    expect(ordered.map((v) => v.id)).toEqual([1, 2, 3, 4]);
  });

  it('returns null on malformed output', () => {
    expect(parseAiResponse('not json at all')).toBeNull();
    expect(parseAiResponse('{"patterns": "nope"}')).toBeNull();
  });
});

describe('buildAiOrderedVideos', () => {
  const pool = [video(1, 'a'), video(2, 'b'), video(3, 'c'), video(4, 'd'), video(5, 'e')];
  const analyzed = pool.slice(0, 3);

  it('orders pattern groups, then Other Patterns, then the rest in original order', () => {
    const ordered = buildAiOrderedVideos(
      { patterns: [{ heading: 'P', pattern: 'p', videoIds: [3, 1] }], otherIds: [2] },
      analyzed,
      pool,
    );
    expect(ordered.map((v) => v.id)).toEqual([3, 1, 2, 4, 5]);
  });

  it('puts analyzed ids the LLM never mentioned into Other Patterns (before beyond-50)', () => {
    const ordered = buildAiOrderedVideos(
      { patterns: [{ heading: 'P', pattern: 'p', videoIds: [1] }], otherIds: [] },
      analyzed,
      pool,
    );
    expect(ordered.map((v) => v.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('drops ids absent from the pool', () => {
    const ordered = buildAiOrderedVideos(
      { patterns: [{ heading: 'P', pattern: 'p', videoIds: [999] }], otherIds: [] },
      analyzed,
      pool,
    );
    expect(ordered.map((v) => v.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
