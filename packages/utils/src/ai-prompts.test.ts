import { describe, expect, it } from 'vitest';
import { buildWordExplainPrompt, buildExplainBlockPrompt } from './ai-prompts';

const T = {
  contextForm: 'Explain the {l2Name} word "{word}" (form: {contextForm}) in "{context}".',
  context: 'Explain the {l2Name} word "{word}" in "{context}".',
  plain: 'Explain the {l2Name} word "{word}".',
  morphology: 'Give its pronunciation and dictionary form.',
  ticks: 'Wrap every {l2Name} word in backticks.',
};

describe('buildWordExplainPrompt', () => {
  const base = {
    templates: T,
    l2Name: 'Japanese',
    word: '押し切る',
    context: '彼は反対を押し切って決行した。',
    contextForm: '押し切って',
    l2Code: 'ja',
  };

  it('picks the context-form template and strips trailing punctuation', () => {
    const p = buildWordExplainPrompt(base);
    expect(p).toContain('(form: 押し切って)');
    expect(p).toContain('in "彼は反対を押し切って決行した"');
    expect(p).not.toContain('。');
    expect(p).toContain('Wrap every Japanese word in backticks');
  });

  it('appends morphology for an inflecting L2', () => {
    const p = buildWordExplainPrompt({
      ...base, l2Code: 'es', word: 'casa', context: 'La casa es grande.', contextForm: 'casa',
    });
    expect(p).toContain('Give its pronunciation and dictionary form.');
  });

  it('falls back to the plain template without context', () => {
    const p = buildWordExplainPrompt({ ...base, context: undefined, contextForm: undefined });
    expect(p).toContain('Explain the Japanese word "押し切る"');
    expect(p).not.toContain('in "');
  });

  it('omits morphology for non-inflecting L2s (zh)', () => {
    const p = buildWordExplainPrompt({
      ...base, l2Code: 'zh', word: '决定', context: undefined, contextForm: undefined,
    });
    expect(p).not.toContain('Give its pronunciation and dictionary form.');
  });
});

describe('buildExplainBlockPrompt', () => {
  it('builds the numbered breakdown with the backtick item, context, and text', () => {
    const p = buildExplainBlockPrompt({
      templates: {
        header: 'Break down this {l2Code} text. Include:',
        item1: 'Its meaning in {l1Name}',
        item2: 'A breakdown',
        ticks: 'Backtick {l2Name} strings',
        contextLabel: 'Context',
        textLabel: 'Text',
      },
      l2Code: 'ja',
      l1Name: 'English',
      l2Name: 'Japanese',
      context: '前置きの話',
      text: 'こんな感じの文章',
    });
    expect(p).toContain('Break down this ja text. Include:');
    expect(p).toContain('1. Its meaning in English');
    expect(p).toContain('3. Backtick Japanese strings');
    expect(p).toContain('Context: 前置きの話');
    expect(p).toContain('Text: こんな感じの文章');
  });
});
