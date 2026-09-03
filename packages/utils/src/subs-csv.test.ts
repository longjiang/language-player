import { describe, expect, it } from 'vitest';
import { parseSubtitleCSV, findMatchLine } from './subs-csv';

describe('parseSubtitleCSV', () => {
  it('parses basic starttime,line CSV', () => {
    const lines = parseSubtitleCSV('starttime,line\n31.54,SO CHECK IT OUT\n33.78,WE ARE THE BEST');
    expect(lines).toEqual([
      { starttime: 31.54, line: 'SO CHECK IT OUT' },
      { starttime: 33.78, line: 'WE ARE THE BEST' },
    ]);
  });

  // SPEC-091: the DB stores YouTube's raw entity encoding; the parser must
  // decode it (server also decodes since SPEC-091 — this is the safety net).
  it('decodes single-encoded HTML entities', () => {
    const lines = parseSubtitleCSV('starttime,line\n1.0,ISN&#39;T IT LOVELY');
    expect(lines[0]?.line).toBe("ISN'T IT LOVELY");
  });

  it('decodes double-encoded YouTube entities', () => {
    // &amp;#39; → pass 1 &#39; → pass 2 '
    const lines = parseSubtitleCSV('starttime,line\n1.0,fish &amp;#39;&amp; chips');
    expect(lines[0]?.line).toBe("fish '& chips");
  });

  it('decodes quoted fields without corrupting CSV structure', () => {
    // A literal &quot; inside a quoted field must become " AFTER parsing,
    // never before (decoding first would break the quoted-field structure).
    const csv = 'starttime,line\n1.0,"she said &quot;hello&quot; loudly"';
    const lines = parseSubtitleCSV(csv);
    expect(lines[0]?.line).toBe('she said "hello" loudly');
  });

  it('leaves literal ampersands untouched', () => {
    const lines = parseSubtitleCSV('starttime,line\n1.0,AT&T and R&D; labs');
    expect(lines[0]?.line).toBe('AT&T and R&D; labs');
  });

  it('is idempotent on already-decoded text', () => {
    const lines = parseSubtitleCSV("starttime,line\n1.0,isn't it lovely");
    expect(lines[0]?.line).toBe("isn't it lovely");
  });

  it('parses the optional duration column', () => {
    const lines = parseSubtitleCSV('starttime,duration,line\n1.0,2.5,hello &#39;world&#39;');
    expect(lines[0]).toEqual({ starttime: 1, duration: 2.5, line: "hello 'world'" });
  });

  it('drops rows without a numeric starttime or an empty line', () => {
    const lines = parseSubtitleCSV('starttime,line\nabc,nope\n2.0,keepme\n3.0,   ');
    expect(lines).toEqual([{ starttime: 2, line: 'keepme' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseSubtitleCSV('')).toEqual([]);
  });
});

describe('findMatchLine with entity-encoded data', () => {
  it('matches decoded terms against entity-encoded lines (SPEC-091)', () => {
    const lines = parseSubtitleCSV("starttime,line\n1.0,ISN&amp;#39;T IT LOVELY");
    expect(findMatchLine(lines, "isn't")).toBe(0);
  });

  it('parses the exact CSV the Flask reducer emits after decoding (SPEC-091 round-trip)', () => {
    // Real output of utils_content._reduce_subs_to_context on entity-encoded
    // input: decoded text, quotes re-escaped per CSV rules.
    const flaskCsv =
      'starttime,duration,line\n' +
      "649.339,1.1,♪ ISN'T IT LOVELY ♪\n" +
      '650.5,1.2,"she said ""fold \'em"" plainly"\n';
    const lines = parseSubtitleCSV(flaskCsv);
    expect(lines[0]?.line).toBe("♪ ISN'T IT LOVELY ♪");
    expect(lines[1]?.line).toBe('she said "fold \'em" plainly');
    expect(findMatchLine(lines, "isn't")).toBe(0);
  });
});
