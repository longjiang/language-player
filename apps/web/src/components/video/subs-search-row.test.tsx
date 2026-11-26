// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';

/**
 * SPEC-114 — the subs-search result row renders its L2 line through
 * `TokenizedText` in display-only mode.
 *
 * Why this test exists: the row used to render the raw subtitle string with a
 * substring `<mark>`, so a learner who prefers Traditional Chinese saw the
 * source script (Simplified) with no phonetics. The row now delegates to
 * `TokenizedText` (ADR-0019 render-layer conversion + phonetics settings) but
 * must stay a *preview*:
 *   - no dictionary popup / no token interaction (clicks reach the row),
 *   - no saved-word highlighting,
 *   - no interlinear definitions (a row stays one line tall),
 *   - search terms still highlighted, `[n]` note badges still drawn.
 */

const captured: { props: Record<string, unknown> | null } = { props: null };

vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: (props: Record<string, unknown>) => {
    captured.props = props;
    return <span data-testid="tokenized">{String(props.text)}</span>;
  },
}));

vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en' }, l2: { code: 'zh' } }),
}));

vi.mock('@/lib/logger', () => ({ log: () => {} }));

import { SubsSearchRow } from './subs-search-row';

const NOTES = [{ id: 1, note: 'a note' }];

const VIDEO: SubsSearchVideo = {
  id: 1,
  title: 'Test video',
  youtube_id: 'abc123',
  subs_l2: [{ starttime: 12, line: '我買了口紅' }],
  matchLineIndex: 0,
  notes: NOTES,
} as SubsSearchVideo;

const TRANSLATIONS: SubtitleLine[] = [{ line: 'I bought **lipstick**', starttime: 0 }];

function renderRow(overrides: Partial<React.ComponentProps<typeof SubsSearchRow>> = {}) {
  return render(
    <SubsSearchRow
      video={VIDEO}
      index={0}
      isActive={false}
      onSelect={() => {}}
      segments={[{ text: '我買了口紅', hasTerm: true }]}
      highlightTerms={['口紅']}
      showTranslation
      translationStart={0}
      translations={TRANSLATIONS}
      translating={false}
      firstLineIndex={0}
      {...overrides}
    />,
  );
}

describe('SubsSearchRow (SPEC-114)', () => {
  it('renders the matched line through TokenizedText in display-only mode', () => {
    captured.props = null;
    const { getByTestId } = renderRow();

    expect(getByTestId('tokenized').textContent).toBe('我買了口紅');
    const props = captured.props!;
    // Script preference + phonetics come from TokenizedText's own settings, so
    // the row must NOT override them — only the interaction/size surface.
    expect(props.l2Code).toBe('zh');
    expect(props.highlightForms).toEqual(['口紅']);
    expect(props.notes).toBe(NOTES);
    // Display-only: no popup, no saved-word highlight, no interlinear gloss.
    expect(props.disablePopup).toBe(true);
    expect(props.highlightSaved).toBe(false);
    expect(props.showDefinition).toBe(false);
    // SPEC-051 block-level rule: no textScale / inline override.
    expect(props.textScale).toBeUndefined();
    expect(props.inline).toBeFalsy();
    expect(props.inheritSize).toBeFalsy();
  });

  it('makes the tokenized line inert so taps fall through to the row', () => {
    const { getByTestId } = renderRow();
    const line = getByTestId('tokenized');
    expect(line.parentElement?.className).toContain('pointer-events-none');
  });

  it('keeps the muted treatment for a line with no search term', () => {
    captured.props = null;
    renderRow({ segments: [{ text: '我買了口紅', hasTerm: false }] });
    expect(captured.props!.textColor).toBe('text-muted-foreground');
  });

  it('still renders the translation with its highlighted term', () => {
    const { container } = renderRow();
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('lipstick');
  });
});
