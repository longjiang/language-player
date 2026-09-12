/**
 * @langplayer/textbooks — interactive textbook content model and logic
 * (SPEC-095).
 *
 * Platform-agnostic: content types, validation, grading, the task response
 * store and asset resolution. The web and mobile UI live in their own apps
 * (ADR-0003: share logic, not views).
 */

export type {
  AudioTrack,
  Bank,
  BlankKind,
  BlankResponse,
  BlankResult,
  BlankSpec,
  BookMeta,
  LessonMeta,
  PassageStimulus,
  Stimulus,
  Task,
  TaskResult,
  TaskType,
  UnitMeta,
} from './types';

export {
  acceptedAnswers,
  expandAcceptedVariants,
  gradeTask,
  isBlankCorrect,
  normalizeAnswer,
} from './grading';

export {
  answersForKeyIndex,
  circledToIndex,
  indexToCircled,
  parseAnswerKey,
} from './answer-key';
export type { AnswerKeyItem } from './answer-key';

export { assertValid, validateBook, validateLesson, validateTask } from './schema';
export type { IssueLevel, ValidationIssue, ValidationOptions } from './schema';

export { BlankSelectionStore, TaskResponseStore } from './store';
export type {
  AttemptRecord,
  PersistedTaskState,
  TaskStateAdapter,
  TaskStoreOptions,
} from './store';

export { assetKeySet, createAssetResolver, resolveAssetKey } from './assets';
export type { AssetManifest, AssetResolver } from './assets';

export {
  adjacentTasks,
  allTasks,
  bookLoaders,
  buildTocTree,
  findLesson,
  findTask,
  loadBook,
  taskHref,
  taskPathParts,
  TEXTBOOK_CATALOGUE,
} from './loaders';
export type { BookSummary, TocLesson, TocTask, TocTree, TocUnit } from './loaders';
