/**
 * Deep-merge two plain objects. `base` provides fallback values and
 * `override` takes priority; nested objects are merged recursively.
 *
 * Used by the i18n layer (server + client) to layer a locale's messages
 * on top of English as the base/fallback set.
 */

type PlainRecord = Record<string, unknown>;

export function deepMerge(base: PlainRecord, override: PlainRecord): PlainRecord {
  const result: PlainRecord = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      baseVal != null &&
      overrideVal != null &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(baseVal as PlainRecord, overrideVal as PlainRecord);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}
