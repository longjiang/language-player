/**
 * SPEC-053 Phase 2 — syncable-entity contracts.
 *
 * The outbox engine never guesses how payloads combine: each entity declares
 * a schema (whole-row contract) and a domain-owned `coalesce`. A payload that
 * fails validation is rejected at enqueue time instead of silently producing
 * corrupted rows (the note create → edit → rename bug that lost text).
 */

export type SyncFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface SyncEntityDef {
  entity: string;
  /** Required fields + types for an upsert payload. */
  schema: Record<string, SyncFieldType>;
  /**
   * Combine two pending upsert payloads for the same entity.
   * Whole-row entities replace; partial-field entities merge.
   */
  coalesce: (
    prev: Record<string, unknown>,
    next: Record<string, unknown>,
  ) => Record<string, unknown>;
}

const SYNC_ENTITY_DEFS: Record<string, SyncEntityDef> = {
  note: {
    entity: 'note',
    // Whole-row contract: every queued note op carries the full note.
    schema: { l2: 'string', title: 'string', text: 'string', translation: 'string' },
    // Merge as a safety net even for full rows (harmless), so a legacy
    // partial payload can never drop fields that were already queued.
    coalesce: (prev, next) => ({ ...prev, ...next }),
  },
  saved_word: {
    entity: 'saved_word',
    schema: { l2: 'string', wordId: 'string', word: 'object' },
    coalesce: (_prev, next) => next,
  },
  progress: {
    entity: 'progress',
    schema: { l2: 'string' },
    coalesce: (_prev, next) => next,
  },
  srs_card: {
    entity: 'srs_card',
    schema: { l2: 'string', wordId: 'string', state: 'object' },
    coalesce: (_prev, next) => next,
  },
  srs_settings: {
    entity: 'srs_settings',
    schema: { dailyNewLimit: 'number' },
    coalesce: (_prev, next) => next,
  },
  settings: {
    entity: 'settings',
    schema: { settings_v2: 'object' },
    coalesce: (_prev, next) => next,
  },
  watch_history: {
    entity: 'watch_history',
    schema: { videoId: 'number' },
    coalesce: (_prev, next) => next,
  },
};

/** Safe defaults for optional schema fields (used to heal legacy payloads). */
const PAYLOAD_DEFAULTS: Record<string, Record<string, unknown>> = {
  note: { title: 'Untitled', text: '', translation: '' },
};

export function getSyncEntityDef(entity: string): SyncEntityDef | null {
  return SYNC_ENTITY_DEFS[entity] ?? null;
}

function fieldMatches(type: SyncFieldType, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
  }
}

/**
 * Validate an upsert payload against the entity's whole-row schema.
 * Throws a descriptive Error on any missing/incorrectly-typed required field.
 */
export function validateSyncPayload(
  entity: string,
  payload: Record<string, unknown>,
): void {
  const def = getSyncEntityDef(entity);
  if (!def) {
    throw new Error(`[sync] unknown sync entity: ${entity}`);
  }
  for (const [key, type] of Object.entries(def.schema)) {
    if (!(key in payload)) {
      throw new Error(`[sync] ${entity} upsert payload missing required key: ${key}`);
    }
    if (!fieldMatches(type, payload[key])) {
      throw new Error(`[sync] ${entity} upsert payload key "${key}" must be ${type}`);
    }
  }
}

/** Combine two pending upsert payloads using the entity's domain rule. */
export function coalesceSyncPayload(
  entity: string,
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const def = getSyncEntityDef(entity);
  if (!def) {
    throw new Error(`[sync] unknown sync entity: ${entity}`);
  }
  return def.coalesce(prev, next);
}

/**
 * Heal a legacy/partial payload before pushing: fill missing required schema
 * fields from `source` (e.g. the entity_cache row) or safe defaults. Ops
 * queued before the whole-row contract are otherwise rejected forever by the
 * server's strict validation.
 */
export function repairSyncPayload(
  entity: string,
  payload: Record<string, unknown>,
  source?: Record<string, unknown> | null,
): Record<string, unknown> {
  const def = getSyncEntityDef(entity);
  if (!def) return payload;
  const out = { ...payload };
  for (const key of Object.keys(def.schema)) {
    if (key in out) continue;
    if (source && key in source) {
      out[key] = source[key];
    } else if (PAYLOAD_DEFAULTS[entity]?.[key] !== undefined) {
      out[key] = PAYLOAD_DEFAULTS[entity][key];
    }
  }
  return out;
}
