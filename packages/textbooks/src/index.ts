/**
 * @langplayer/textbooks — interactive textbook content model and logic
 * (SPEC-095).
 *
 * Platform-agnostic: content types, validation, grading, the task response
 * store and asset resolution. The web and mobile UI live in their own apps
 * (ADR-0003: share logic, not views).
 */

export {
  PICK_SEPARATOR,
  pickValues,
} from './types';
export {
  audioTracksIn,
  bankChoiceOptions,
  bankInDialog,
  bankIsPicked,
  dialogBankIds,
  inlineBankIds,
  pictureSetsIn,
  recordingsIn,
  tasksIn,
  textsIn,
  trailingIllustrationSlot,
  transcriptsIn,
} from './types';
export { TASK_TYPES, taskTypeKey } from './task-types';
export {
  isAppToHostMessage,
  MOCK_APP_PROTOCOL_VERSION,
  mockAppHref,
  protocolCompatible,
} from './mock-app';
export type {
  AppToHostMessage,
  CompleteMessage,
  HelpModeMessage,
  HintMessage,
  HostToAppMessage,
  InitMessage,
  LookupMessage,
  MockAppGoal,
  ProgressMessage,
  ReadyMessage,
  ResetMessage,
  ResizeMessage,
  TokenizeRequestMessage,
  TokensMessage,
} from './mock-app';
export type {
  AudioTrack,
  Bank,
  BlankKind,
  BlankResponse,
  BlankResult,
  BlankSpec,
  BookMeta,
  DataTableStimulus,
  OrderListItem,
  OrderListStimulus,
  DialogueLine,
  DictationStimulus,
  DialogueStimulus,
  FreeWriteStimulus,
  ImageMapPin,
  ImageMapStimulus,
  RecallStimulus,
  RecordingRef,
  TranscriptLine,
  LessonMeta,
  MockAppGoalLink,
  MockAppStimulus,
  NoteCardsStimulus,
  NumberedBlanksStimulus,
  PassageStimulus,
  PictureOption,
  RecordStimulus,
  PictureSetStimulus,
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
  isBlankScoreable,
  normalizeAnswer,
} from './grading';

export {
  answersForKeyIndex,
  answersForKeyLabel,
  circledToIndex,
  indexToCircled,
  parseAnswerKey,
  parseLabelledAnswerKey,
} from './answer-key';
export type { AnswerKeyItem } from './answer-key';

export { assertValid, validateBook, validateLesson, validateTask } from './schema';
export type { IssueLevel, ValidationIssue, ValidationOptions } from './schema';

export { normalisePersistedTaskState } from './persisted-state';
export { relatedTaskIds } from './related';
export {
  collectTaskOps,
  emptyTaskState,
  liveRecordingSlotsByTask,
  remoteStateForTask,
} from './task-sync';
export type { TaskStateResponse, TaskSyncOpDraft } from './task-sync';

export {
  RECORDING_BYTES_CAP,
  RECORDING_CHUNK_BYTES,
  RECORDING_MAX_SEC,
  chunkCount,
  formatDuration,
  hasRecording,
  recordingSlotsIn,
  requiredRecordingSlotsIn,
} from './recordings';
export type { RecordingSlot } from './recordings';

export { BlankSelectionStore, TaskResponseStore } from './store';
export type {
  AttemptRecord,
  PersistedTaskState,
  RemoteTaskState,
  TaskStateAdapter,
  TaskStoreOptions,
} from './store';

export {
  assetKeySet,
  createAssetResolver,
  DEFAULT_TEXTBOOK_ASSET_BASE_URL,
  resolveAssetKey,
} from './assets';
export type { AssetManifest, AssetResolver } from './assets';

export {
  adjacentTasks,
  allTasks,
  bookLoaders,
  booksForL2,
  buildTocTree,
  findLesson,
  findTask,
  hasTextbookForL2,
  loadBook,
  taskHref,
  taskPathParts,
  TEXTBOOK_CATALOGUE,
} from './loaders';
export type { BookSummary, TocLesson, TocTask, TocTree, TocUnit } from './loaders';

// Content (the pilot book). Exported so an authoring/publish script and the
// tests can reach the manifest without importing a deep path.
export { TBLT_HSK4_ASSET_KEYS } from './content/tblt-hsk4/assets';

export { bookProgress, progressForId, summarizeProgress, taskProgress } from './progress';
export { moveRow, moveRowBy, orderFromPositions, sameOrder } from './order';
export type { OrderRow } from './order';
export type {
  BookProgress,
  LessonProgress,
  ProgressSummary,
  ProgressTree,
  TaskProgress,
  UnitProgress,
} from './progress';
