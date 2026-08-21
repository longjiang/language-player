export const LANGUAGE_PLAYER_URL = 'https://languageplayer.io';

export function languagePlayerPath(l1: string, l2: string, path: string): string {
  return `${LANGUAGE_PLAYER_URL}/${encodeURIComponent(l1)}/${encodeURIComponent(l2)}/${path.replace(/^\//, '')}`;
}
