// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSrs } from '@/hooks/use-srs';
import { fsrs, rate } from '@langplayer/utils';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn<() => { data: { user: { id: string } } | null; status: string }>(
    () => ({ data: null, status: 'unauthenticated' }),
  ),
  deleteSrsCard: vi.fn(async () => ({ success: true })),
  useUserDataColumns: vi.fn(() => ({
    getSrs: vi.fn(async () => ({ settings: { dailyNewLimit: 20 }, cards: {} })),
    putSrsCard: vi.fn(async () => ({ success: true })),
  })),
}));

vi.mock('next-auth/react', () => ({ useSession: mocks.useSession }));
vi.mock('@langplayer/api-client', () => ({
  deleteSrsCard: mocks.deleteSrsCard,
  useUserDataColumns: mocks.useUserDataColumns,
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logwarn: vi.fn() }));

const STORAGE_KEY = 'zthSrsProgress';
const NOW = Date.parse('2026-08-11T12:00:00Z');

describe('useSrs (SPEC-066)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mocks.useUserDataColumns.mockReturnValue({
      getSrs: vi.fn(async () => ({ settings: { dailyNewLimit: 20 }, cards: {} })),
      putSrsCard: vi.fn(async () => ({ success: true })),
    });
  });

  it('migrates a legacy localStorage store to v2 FSRS on load', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { dailyNewLimit: 7 },
      cards: {
        ja: {
          w1: {
            ease: 2.5,
            interval: 0,
            repetitions: 0,
            nextReview: NOW,
            lastReview: NOW,
            createdAt: NOW,
          },
        },
      },
    }));

    const { result } = renderHook(() => useSrs());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.store.v).toBe(2);
    expect(result.current.store.settings.dailyNewLimit).toBe(7);
    const w1 = result.current.store.cards.ja!['w1']!;
    expect(w1.state).toBe(0); // new
    expect(w1.due).toBe(NOW);
    expect(w1.stability).toBe(1);
  });

  it('merges mixed-shape cloud cards and keeps the newer lastReview', async () => {
    const local = rate(fsrs.newCard(NOW), 'good', NOW); // learning, lastReview = NOW
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { dailyNewLimit: 20 },
      cards: { ja: { w1: local } },
    }));

    mocks.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
    mocks.useUserDataColumns.mockReturnValue({
      getSrs: vi.fn(async () => ({
        settings: { dailyNewLimit: 20 },
        cards: {
          ja: {
            // Older legacy card for the same word — must NOT overwrite local.
            w1: {
              ease: 2.5,
              interval: 0,
              repetitions: 0,
              nextReview: NOW,
              lastReview: NOW - 1000,
              createdAt: NOW,
            },
            // Brand-new legacy card from the cloud — must be normalized in.
            w2: {
              ease: 2.5,
              interval: 4,
              repetitions: 1,
              nextReview: NOW + 4 * 86_400_000,
              lastReview: NOW,
              createdAt: NOW,
            },
          },
        },
      })),
      putSrsCard: vi.fn(async () => ({ success: true })),
    });

    const { result } = renderHook(() => useSrs());
    await waitFor(() => expect(result.current.store.cards.ja?.['w2']).toBeDefined());

    const w1 = result.current.store.cards.ja!['w1']!;
    expect(w1.lastReview).toBe(NOW);
    expect(w1.state).toBe(1); // local learning card wins

    const w2 = result.current.store.cards.ja!['w2']!;
    expect(w2.v).toBe(2);
    expect(w2.state).toBe(2); // graduated legacy → review
    expect(w2.due).toBe(NOW + 4 * 86_400_000);
  });

  it('pushes a normalized FSRS card through putSrsCard', async () => {
    const putSrsCard = vi.fn(async () => ({ success: true }));
    mocks.useUserDataColumns.mockReturnValue({
      getSrs: vi.fn(async () => ({ settings: { dailyNewLimit: 20 }, cards: {} })),
      putSrsCard,
    });

    const { result } = renderHook(() => useSrs());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const updated = rate(fsrs.newCard(NOW), 'again', NOW);
    act(() => {
      result.current.updateCard('ja', 'w1', updated);
    });

    await waitFor(() => expect(putSrsCard).toHaveBeenCalledTimes(1));
    expect(putSrsCard).toHaveBeenCalledWith('ja', 'w1', expect.objectContaining({
      v: 2,
      state: 1,
      due: updated.due,
      reps: 1,
    }));
    expect(result.current.store.cards.ja!['w1']!.state).toBe(1);
  });
});
