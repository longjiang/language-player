import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

/** Returns the last visited language pair, if both cookies are valid. */
export function getLastLanguagePair(): { l1: string; l2: string } | null {
  const l1 = getCookie('l1');
  const l2 = getCookie('l2');
  if (
    l1 &&
    l2 &&
    SUPPORTED_L1S.includes(l1 as (typeof SUPPORTED_L1S)[number]) &&
    SUPPORTED_L2S.includes(l2 as (typeof SUPPORTED_L2S)[number])
  ) {
    return { l1, l2 };
  }
  return null;
}

/** Explore URL for the last pair, or the language-selection page if none exists. */
export function getExploreUrl(): string {
  const pair = getLastLanguagePair();
  return pair ? `/${pair.l1}/${pair.l2}/explore` : '/language-select';
}
