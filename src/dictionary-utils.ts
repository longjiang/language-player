import { DictionaryEntry, RawEntry, Level } from "@/src/dictionary-types";

export const generateUniqueId = (
  entry: RawEntry,
  entryCount: Record<string, number>
): string => {
  const baseId = `${entry.traditional},${(entry.pinyin || "").replace(
    /\s+/g,
    "_"
  )}`;
  const count = (entryCount[baseId] = (entryCount[baseId] || 0) + 1);
  return `${baseId},${count - 1}`;
};

export const sortEntries = (
  entries: DictionaryEntry[],
  query: string
): DictionaryEntry[] => {
  const exactMatches = entries.filter(
    (entry) => entry.head === query || entry.alternate === query
  );
  const otherMatches = entries
    .filter((entry) => entry.head !== query && entry.alternate !== query)
    .sort((a, b) => {
      if (a.level && b.level) {
        return a.level - b.level;
      } else if (a.level) {
        return -1;
      } else if (b.level) {
        return 1;
      }
      return a.head.length - b.head.length;
    });
  return [...exactMatches, ...otherMatches];
};

export const transformToDictionaryEntry = (entry: any): DictionaryEntry => {
  return {
    id: entry.id,
    hskId: entry.hskId ? parseInt(entry.hskId) : undefined,
    head: entry.head,
    pronunciation: entry.pronunciation,
    alternate: entry.alternate,
    definitions: entry.definitions.split(" | "),
    level: entry.level as Level,
  };
};
