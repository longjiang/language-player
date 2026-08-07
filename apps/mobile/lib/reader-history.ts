/**
 * Web-reader visited-sites history (SPEC-049 §10.3) — AsyncStorage-backed list
 * of the URLs the user has opened in the web reader, with the page title and
 * last-visit timestamp (mirrors the web app's localStorage history).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'lp:web-reader:visited-sites:v1';

export interface VisitedSite {
  url: string;
  title: string;
  visitedAt: number;
}

export async function loadVisitedSites(): Promise<VisitedSite[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is VisitedSite => !!s && typeof (s as VisitedSite).url === 'string')
      .map((s) => ({
        url: s.url,
        title: typeof s.title === 'string' ? s.title : s.url,
        visitedAt: typeof s.visitedAt === 'number' ? s.visitedAt : 0,
      }))
      .sort((a, b) => b.visitedAt - a.visitedAt);
  } catch {
    return [];
  }
}

async function saveVisitedSites(sites: VisitedSite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(sites));
  } catch {
    // non-critical
  }
}

/** Record a visit (deduped by URL, most recent first). */
export async function recordVisit(url: string, title: string): Promise<VisitedSite[]> {
  const sites = await loadVisitedSites();
  const next = [
    { url, title: title || url, visitedAt: Date.now() },
    ...sites.filter((s) => s.url !== url),
  ].slice(0, 50);
  await saveVisitedSites(next);
  return next;
}

export async function removeVisitedSite(url: string): Promise<VisitedSite[]> {
  const sites = await loadVisitedSites();
  const next = sites.filter((s) => s.url !== url);
  await saveVisitedSites(next);
  return next;
}
