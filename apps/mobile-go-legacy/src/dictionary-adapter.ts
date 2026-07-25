import type { DictionaryEntry as SharedEntry } from '@langplayer/shared';
import type { DictionaryEntry as MobileEntry } from '@/src/dictionary-types';

/**
 * Adapter: converts a shared DictionaryEntry (from the Python backend)
 * to the mobile app's local DictionaryEntry type.
 *
 * This is a temporary bridge during Phase 1 migration.
 * Phase 3 will remove this and use the shared type directly.
 */
export function sharedEntryToMobileEntry(entry: SharedEntry): MobileEntry {
  // Extract the most relevant numeric proficiency level
  let level: MobileEntry['level'] = undefined;
  if (entry.levels && entry.levels.length > 0) {
    const firstLevel = entry.levels[0];
    if (typeof firstLevel.value === 'number') {
      level = firstLevel.value as MobileEntry['level'];
    } else {
      // Try to parse string values like "B1", "N3", etc.
      const num = parseInt(firstLevel.value as string, 10);
      if (!isNaN(num)) {
        level = num as MobileEntry['level'];
      }
    }
  }

  // Map part_of_speech → pos (deprecated field, kept for compat)
  const pos = entry.part_of_speech ?? undefined;

  // Map phonetic_detail — the shared type is a superset of mobile's
  const phonetic_detail = entry.phonetic_detail
    ? {
        pinyin: entry.phonetic_detail.pinyin,
        kana: entry.phonetic_detail.kana,
        romaji: entry.phonetic_detail.romaji,
        jyutping: entry.phonetic_detail.jyutping,
        romanization: entry.phonetic_detail.romanization,
        ipa: entry.phonetic_detail.ipa,
      }
    : null;

  return {
    id: entry.id,
    head: entry.head,
    definitions: entry.definitions,
    pronunciation: entry.pronunciation || undefined,
    alternate: entry.alternate ?? undefined,
    level,
    pos,
    phonetic_detail,
  };
}
