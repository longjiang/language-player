/**
 * Mock app bridge contract (SPEC-095, ADR-0045).
 *
 * A mock app is a self-contained HTML file in a sandboxed frame. The host knows
 * nothing about the app's UI — only this message set, which both sides speak.
 * Keeping the types here (pure TS, no DOM) is what lets the web iframe host, the
 * mobile WebView host and the runtime script agree on one definition.
 *
 * The version is a hard gate: the frame refuses a mismatched MAJOR, because a
 * silent mismatch would surface as an app that loads but never responds.
 */

export const MOCK_APP_PROTOCOL_VERSION = 1;

/** One task goal, as the app declares it and as the bridge itemises it. */
export interface MockAppGoal {
  /** Stable id, unique within the app. */
  id: string;
  /** Shown in the host's progress/answer list. */
  prompt?: string;
}

// ─── Host → app ──────────────────────────────────────────────────────────

export interface InitMessage {
  v: number;
  type: 'init';
  payload: {
    l1: string;
    l2: string;
    /** Whether help mode is already on (e.g. restored from a saved attempt). */
    helpMode: boolean;
  };
}

export interface HelpModeMessage {
  v: number;
  type: 'help-mode';
  payload: { on: boolean };
}

export interface HintMessage {
  v: number;
  type: 'hint';
}

export interface ResetMessage {
  v: number;
  type: 'reset';
}

/**
 * Which task is being asked, and what is already selected for it.
 *
 * The app cannot know this on its own: the tasks live in the content, and the student moves
 * between them in the host's panel. It also carries the selection so the app can draw it —
 * coming back to a task the student already answered shows what they answered with, and a
 * task they have not reached shows nothing.
 */
export interface FocusMessage {
  v: number;
  type: 'focus';
  payload: {
    goalId: string;
    /** Selections already stored for this goal, in the order they were made. */
    picks: string[];
  };
}

/** Reply to `tokenize`, keyed by the exact string the app asked about. */
export interface TokensMessage {
  v: number;
  type: 'tokens';
  payload: {
    map: Record<string, Array<{ text: string; lemmas: Array<{ lemma: string }> }>>;
  };
}

export type HostToAppMessage =
  | InitMessage
  | FocusMessage
  | HelpModeMessage
  | HintMessage
  | ResetMessage
  | TokensMessage;

// ─── App → host ──────────────────────────────────────────────────────────

export interface ReadyMessage {
  v: number;
  type: 'ready';
  payload: { app: string; version: string; goals: MockAppGoal[] };
}

export interface TokenizeRequestMessage {
  v: number;
  type: 'tokenize';
  payload: { texts: string[] };
}

export interface LookupMessage {
  v: number;
  type: 'lookup';
  payload: {
    text: string;
    lemma?: string;
    /** Token rect in the FRAME's coordinate space; the host maps it. */
    rect: { x: number; y: number; width?: number; height?: number };
    /** Sentence the token sits in, for saved-word context. */
    sentence?: string;
  };
}

export interface ProgressMessage {
  v: number;
  type: 'progress';
  payload: { done: string[]; total: number };
}

export interface CompleteMessage {
  v: number;
  type: 'complete';
  payload: { goalId: string; answer: string };
}

export interface ResizeMessage {
  v: number;
  type: 'resize';
  payload: { height: number };
}

/**
 * What the student has selected for the task they are on.
 *
 * The app reports the selection, not a verdict: an app cannot know what the content asks for,
 * and it is the host that grades. This is what makes selecting and unselecting a real
 * interaction — the host is told about both, and the blank follows.
 */
export interface SelectionMessage {
  v: number;
  type: 'selection';
  payload: { goalId: string; picks: string[] };
}

export type AppToHostMessage =
  | ReadyMessage
  | TokenizeRequestMessage
  | LookupMessage
  | SelectionMessage
  | ProgressMessage
  | CompleteMessage
  | ResizeMessage;

// ─── Validation ──────────────────────────────────────────────────────────

const APP_TO_HOST_TYPES = new Set<AppToHostMessage['type']>([
  'ready',
  'tokenize',
  'lookup',
  'selection',
  'progress',
  'complete',
  'resize',
]);

/**
 * Narrow an untrusted `message` event into a contract message.
 *
 * Everything crossing the frame boundary is untrusted — the app is a document
 * the host did not write at runtime — so every field the host acts on is checked
 * rather than destructured optimistically.
 */
export function isAppToHostMessage(value: unknown): value is AppToHostMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as { v?: unknown; type?: unknown; payload?: unknown };
  if (typeof msg.v !== 'number' || typeof msg.type !== 'string') return false;
  if (!APP_TO_HOST_TYPES.has(msg.type as AppToHostMessage['type'])) return false;
  if (!msg.payload || typeof msg.payload !== 'object') return false;

  const payload = msg.payload as Record<string, unknown>;
  switch (msg.type as AppToHostMessage['type']) {
    case 'ready':
      return typeof payload.app === 'string' && Array.isArray(payload.goals);
    case 'tokenize':
      return Array.isArray(payload.texts) && payload.texts.every((t) => typeof t === 'string');
    case 'lookup':
      return (
        typeof payload.text === 'string' &&
        Boolean(payload.rect) &&
        typeof (payload.rect as { x?: unknown }).x === 'number' &&
        typeof (payload.rect as { y?: unknown }).y === 'number'
      );
    case 'selection':
      return (
        typeof payload.goalId === 'string' &&
        Array.isArray(payload.picks) &&
        payload.picks.every((p) => typeof p === 'string')
      );
    case 'progress':
      return Array.isArray(payload.done) && typeof payload.total === 'number';
    case 'complete':
      return typeof payload.goalId === 'string' && typeof payload.answer === 'string';
    case 'resize':
      return typeof payload.height === 'number';
    default:
      return false;
  }
}

/** True when the host and app can speak to each other. */
export function protocolCompatible(version: number): boolean {
  return Math.floor(version) === MOCK_APP_PROTOCOL_VERSION;
}

/** The href a mock app is served from, given the base and app id. */
export function mockAppHref(baseUrl: string, appId: string): string {
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(appId)}/index.html`;
}
