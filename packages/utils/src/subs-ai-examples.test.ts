import { describe, it, expect } from 'vitest';
import {
  AI_EXAMPLES_TARGET,
  buildAiExamplesPayload,
  buildAiExamplesPrompt,
  parseAiExamplesResponse,
} from './subs-ai-examples';
import type { SubsSearchVideo } from '@langplayer/shared';

function makeVideo(id: number, lines: string[], matchLineIndex: number): SubsSearchVideo {
  return {
    id,
    title: `Video ${id}`,
    youtube_id: `yt-${id}`,
    subs_l2: lines.map((line, i) => ({ line, starttime: i * 2 })),
    matchLineIndex,
  };
}

describe('buildAiExamplesPayload', () => {
  it('emits up to 3 lines per video with the matched line starred', () => {
    const videos = [makeVideo(1, ['before', 'matched term here', 'after'], 1)];
    const payload = buildAiExamplesPayload(videos);
    expect(payload.split('\n')).toEqual([
      'id,"line"',
      '1,"before"',
      '1,"*matched term here"',
      '1,"after"',
    ]);
  });

  it('clamps to the line bounds at the edges', () => {
    const videos = [makeVideo(2, ['first line', 'second'], 0)];
    const payload = buildAiExamplesPayload(videos);
    expect(payload.split('\n')).toEqual(['id,"line"', '2,"*first line"', '2,"second"']);
  });

  it('respects the limit and skips videos without a match', () => {
    const videos = [
      makeVideo(1, ['matched'], 0),
      makeVideo(2, ['also matched'], 0),
      { ...makeVideo(3, ['x'], 0), matchLineIndex: -1 },
    ];
    const payload = buildAiExamplesPayload(videos, 1);
    expect(payload).toBe('id,"line"\n1,"*matched"');
  });
});

describe('buildAiExamplesPrompt', () => {
  it('asks for strict JSON with the target count', () => {
    const prompt = buildAiExamplesPrompt({
      prose: 'Pick examples.',
      lines: 'id,"line"\n1,"*word"',
      l1Name: 'English',
      l2Name: 'Japanese',
      term: 'word',
    });
    expect(prompt).toContain('Pick examples.');
    expect(prompt).toContain('"video_id"');
    expect(prompt).toContain('"explanation"');
    expect(prompt).toContain(String(AI_EXAMPLES_TARGET));
    expect(prompt).toContain('English');
    expect(prompt).toContain('Japanese');
  });
});

describe('parseAiExamplesResponse', () => {
  it('parses a clean JSON response', () => {
    const result = parseAiExamplesResponse(
      '{"examples": [{"video_id": 11, "explanation": "Here it means X."}, {"video_id": "22", "explanation": "Here it means Y."}]}',
    );
    expect(result).toEqual({
      examples: [
        { videoId: 11, explanation: 'Here it means X.' },
        { videoId: 22, explanation: 'Here it means Y.' },
      ],
    });
  });

  it('tolerates markdown fences and trailing garbage', () => {
    const result = parseAiExamplesResponse(
      '```json\n{"examples": [{"video_id": 7, "explanation": "Means Z."}]}\n``` trailing text',
    );
    expect(result?.examples).toEqual([{ videoId: 7, explanation: 'Means Z.' }]);
  });

  it('drops duplicates and caps at the target', () => {
    const examples = Array.from({ length: 12 }, (_, i) => ({
      video_id: 100 + (i % 3),
      explanation: `Expl ${i}`,
    }));
    const result = parseAiExamplesResponse(JSON.stringify({ examples }));
    expect(result!.examples.length).toBeLessThanOrEqual(AI_EXAMPLES_TARGET);
    const ids = result!.examples.map((e) => e.videoId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects malformed output', () => {
    expect(parseAiExamplesResponse('not json at all')).toBeNull();
    expect(parseAiExamplesResponse('{"examples": [{"video_id": "x", "explanation": ""}]}')).toBeNull();
  });
});
