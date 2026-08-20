export {
  getCachedEntries,
  setCachedEntries,
  getCacheVersion,
  subscribeToCache,
  bulkLookupWords,
  enqueueLookupWords,
  getCachedEntryById,
  setCachedEntryById,
  getIdCacheKeys,
  getTextCacheKeys,
  getL1CachedEntry,
  getL1CachedEntries,
  setL1CachedEntry,
} from './dictionary-cache';
export {
  formatDuration,
  formatNumber,
  formatRelativeDate,
  formatNextDueLabel,
} from './format';
export { languageNameFromCode, baseCode, isRTL, getLanguageDirection, isPhoneticsEligible } from './language';
export { clampDifficulty, levelFromHours, hoursFromLevel } from './difficulty';
export { cn } from './cn';
export { cleanPronunciation, formatPronunciation } from './pronunciation';
export { katakanaToHiragana, matchHiragana, buildRuby } from './furigana';
export type { FuriganaSegment, RubySegment } from './furigana';
export type { SrsFields, SrsProgressStore } from '@langplayer/shared';
export {
  rate,
  newRatingId,
  serializeFsrsCard,
  normalizeFsrsCard,
  deserializeSrsCard,
  migrateSrsStore,
  getCardState,
  countDeckStates,
  srsDueLabel,
  createSrsStore,
  getLanguageCards,
  mergeSrsCards,
} from './fsrs-scheduler';
export type { FsrsCard, FsrsSrsStore, SrsCardState, SrsRating } from './fsrs-scheduler';
/** Namespaced FSRS helpers (newCard, isDue, planNewDeck, …). */
export * as fsrs from './fsrs-scheduler';
export {
  splitIntoMoras,
  applyPitchAccent,
  addPitchAccent,
  applyDownstepOnly,
  formatJapanesePron,
  applyRomajiAccent,
  circledPattern,
} from './pitch-accent';
export { createLogger, getLogLevel, setLogLevel } from './logger';
export type { Logger } from './logger';
export { md5 } from './md5';
export { useEntryCache, useEntryByIdCache } from './use-entry-cache';
export { TokenCache } from './token-cache';
export { parseSubtitles, detectSubtitleFormat } from './subtitle-parser';
export { QueueManager, getGlobalQueueManager } from './queue-manager';
export type { QueueState, QueueType } from './queue-manager';
export { stripMarkdown } from './strip-markdown';
export { deepMerge } from './deep-merge';
export {
  pendingOpKey,
  enqueuePendingOp,
  reducePendingOps,
  flushPendingOps,
} from './saved-words-sync';
export type { PendingSavedWordOp, SavedWordRowApi } from './saved-words-sync';
export { parseSubtitleCSV, parseSubsL2, _parseCSVRow, stripTimestampPrefix, findMatchLine } from './subs-csv';
export { segmentSentences, sentenceContaining, sentenceForToken } from './sentence';
export {
  writtenFormVariants,
  minimalSearchTerms,
  reduceSearchTerms,
} from './search-terms';
export type { WrittenFormEntry, ReduceSearchTermsOptions } from './search-terms';
export type { SentenceSegment } from './sentence';
export { mergePhraseTokens } from './merge-phrase-tokens';
export {
  dailyReviewCounterKey,
  msUntilNextDay,
} from './daily-counter';
export {
  clampDayStartHour,
  localDayStartMs,
  dayKey,
  deviceTimezone,
} from './day-boundary';
export { tokenMatchesAnyTerm, tokenMatchesAnyForm, kanaFormsForEntries } from './highlight-match';
export {
  scoreTestAnswer,
  testScoreToRating,
  needsPronunciationTest,
  DEEP_ORTHOGRAPHY_LANGUAGES,
  buildSrsQuestionPrompt,
  normalizeTestChoice,
  parseSrsQuestionResponse,
} from './srs-test-mode';
export type { SrsTestQuestion, TestQuestionKind } from './srs-test-mode';
export type { HighlightToken, KanaEntryForm } from './highlight-match';
export { pickSavedEntry } from './saved-gloss';
export {
  getSyncEntityDef,
  validateSyncPayload,
  coalesceSyncPayload,
  repairSyncPayload,
  canCoalesceOps,
} from './sync-entities';
export type { SyncEntityDef, SyncFieldType, SyncOutboxOp } from './sync-entities';
export {
  TRANSLATION_FACTOR,
  TRANSLATION_SIZE_MIN,
  TRANSLATION_SIZE_MAX,
  clampTranslationSize,
  translationSizeFactor,
} from './reader-text-size';
export type { TranslationSizeSettings } from './reader-text-size';
export {
  buildSentenceMap,
  sentenceIndexAt,
} from './sentence-map';
export type { SentenceRange, SentenceMap } from './sentence-map';
export {
  AI_ANALYZE_LIMIT,
  buildAiPayload,
  buildAiPrompt,
  buildAiOrderedVideos,
  parseAiResponse,
} from './subs-ai-grouping';
export type { AiPatternGroup, AiGroupingResult } from './subs-ai-grouping';
export {
  durationToSeconds,
  contextChar,
  applyFilterAndSort,
  CONTEXT_GROUP_PLACEHOLDER,
} from './subs-search';
export type { SubsSearchSortKey } from './subs-search';
export {
  AI_EXAMPLES_LIMIT,
  AI_EXAMPLES_MAX,
  AI_EXAMPLES_CONTEXT_LINES,
  buildAiExamplesPayload,
  buildAiExamplesPrompt,
  parseAiExamplesResponse,
} from './subs-ai-examples';
export type { AiVideoExample, AiUsagePatternResult } from './subs-ai-examples';
