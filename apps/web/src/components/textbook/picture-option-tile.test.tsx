// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PictureOptionTile } from './picture-option-tile';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

const item = { letter: 'B', label: '请在安全白线内通行', image: 'tblt-hsk4/u06/a2-b.jpg' };

/**
 * The caption is the exercise's vocabulary, and the picture is the answer.
 *
 * So the caption is tokenized — its words open the dictionary — and it lives *outside* the
 * pick button, because a token inside it would take one tap for two actions: look the word
 * up *and* answer the question with that picture.
 */
describe('a picture option tile', () => {
  it('tokenizes its caption so a student can look the words up', () => {
    render(<PictureOptionTile item={item} onPick={vi.fn()} />);
    const caption = document.querySelector('[data-tokenized]');
    expect(caption?.textContent).toBe(item.label);
  });

  it('keeps the caption out of the pick button, so a look-up cannot answer the question', () => {
    const onPick = vi.fn();
    render(<PictureOptionTile item={item} onPick={onPick} />);
    const button = document.querySelector('button[aria-label]')!;
    const caption = document.querySelector('[data-tokenized]')!;

    expect(button.contains(caption)).toBe(false);
    // The label is still the button's accessible name, so nothing is lost by moving it.
    expect(button.getAttribute('aria-label')).toBe('B. 请在安全白线内通行');

    caption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('still picks the letter when the picture itself is tapped', () => {
    const onPick = vi.fn();
    render(<PictureOptionTile item={item} onPick={onPick} />);
    (document.querySelector('button[aria-label]') as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledWith('B');
  });

  it('marks the tile the current answer names, on both the tile and its button', () => {
    render(<PictureOptionTile item={item} selected onPick={vi.fn()} />);
    expect(document.querySelector('button[aria-label]')!.getAttribute('aria-pressed')).toBe('true');
    // The border and tint moved to the tile that holds both the picture and its caption,
    // which is what the student sees as one option.
    expect(document.querySelector('button[aria-label]')!.parentElement!.className).toContain(
      'border-primary',
    );
  });
});
