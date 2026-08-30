/**
 * SRS test-generation manager shared by the web and mobile review screens.
 *
 * Owns the card-test cache, a single-flight request queue (so the LLM
 * endpoint is never hit concurrently), automatic one-shot retries, and
 * per-test diagnostics. Every test generation / regeneration / prefetch in
 * the review flow routes through this manager.
 *
 * Priority (highest first):
 *   1. 'user'     — explicit regeneration / retry button
 *   2. 'current'  — the card the user is currently testing
 *   3. 'prefetch' — warming the cache for the next two cards
 *
 * The cache is keyed by `${cardKey}:${kind}` where cardKey is
 * `${l2Code}:${l1Code}:${cardId}`, so a card encountered again (within a
 * session or across sessions, when a storage backend is provided) reuses the
 * generated question without another LLM call.
 */

import {
  buildPronunciationQuestionText,
  buildSrsQuestionPrompt,
  normalizeTestChoice,
  parseSrsQuestionResponse,
  validateSrsDefinitionChoices,
  validateSrsPronunciationChoices,
  type SrsTestQuestion,
  type TestQuestionKind,
} from './srs-test-mode';
import { md5 } from './md5';

export type SrsTestPriority = 'user' | 'current' | 'prefetch';

/** Diagnostic details for a failed generation (shown via the tiny Diagnostic link). */
export interface SrsTestDiagnostic {
  kind: TestQuestionKind;
  /** The exact prompt that was sent to the LLM. */
  prompt: string;
  /** The raw LLM response text (null when the HTTP request itself failed). */
  response: string | null;
  /** Human-readable failure reason. */
  error: string;
}

export interface SrsTestGenerationInput {
  kind: TestQuestionKind;
  wordForm: string;
  context: string;
  l1Code: string;
  l2Code: string;
  /** Known correct definition, passed to the prompt when available. */
  definition?: string;
  /** Known correct pronunciation, passed to the prompt when available. */
  pronunciation?: string;
  /** Cache-bust: force a fresh variation (regenerate / retry). */
  regenerate?: boolean;
}

/** The endpoint call, injected by each app (fetch on web, apiClient on mobile). */
export interface SrsTestTransport {
  generate(prompt: string, options: { cache: boolean }): Promise<string>;
}

/** Optional persistence for the test cache (localStorage / AsyncStorage). */
export interface SrsTestCacheStorage {
  load(): Promise<Record<string, SrsTestQuestion>> | Record<string, SrsTestQuestion>;
  save(entries: Record<string, SrsTestQuestion>): void | Promise<void>;
}

export type SrsTestRequestResult =
  | { ok: true; question: SrsTestQuestion; fromCache: boolean }
  | { ok: false; diagnostic: SrsTestDiagnostic };

export interface SrsTestManagerOptions {
  storage?: SrsTestCacheStorage;
  /** Optional structured logger callback (apps wrap their app-prefixed logger). */
  onLog?: (event: string, data?: Record<string, unknown>) => void;
}

export interface SrsTestRequestParams {
  /** `${l2Code}:${l1Code}:${cardId}` — the cache namespace for one card. */
  cardKey: string;
  priority: SrsTestPriority;
  input: SrsTestGenerationInput;
  /** Called when the automatic retry begins (e.g. "There was a problem, trying again…"). */
  onRetry?: () => void;
}

interface QueuedRequest {
  id: number;
  dedupeKey: string;
  cardKey: string;
  priority: SrsTestPriority;
  input: SrsTestGenerationInput;
  onRetry?: () => void;
  promise: Promise<SrsTestRequestResult>;
  resolve: (result: SrsTestRequestResult) => void;
  superseded?: boolean;
}

const PRIORITY_RANK: Record<SrsTestPriority, number> = { user: 2, current: 1, prefetch: 0 };
/** One fresh attempt plus exactly one automatic retry. */
const MAX_ATTEMPTS = 2;
const MAX_CACHE_ENTRIES = 600;

function diagnosticFor(
  kind: TestQuestionKind,
  prompt: string,
  response: string | null,
  error: string,
): SrsTestDiagnostic {
  return { kind, prompt, response, error };
}

/**
 * In-memory card-test cache with optional persistence. Successful questions
 * are cached per `${cardKey}:${kind}` and replayed on later encounters.
 */
export class SrsTestCacheStore {
  private memory = new Map<string, SrsTestQuestion>();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxEntries: number;

  constructor(
    private readonly storage?: SrsTestCacheStorage,
    maxEntries = MAX_CACHE_ENTRIES,
  ) {
    this.maxEntries = maxEntries;
  }

  /** Load persisted entries once. Safe to call repeatedly. */
  ready(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (!this.hydratePromise) {
      this.hydratePromise = (async () => {
        if (!this.storage) return;
        try {
          const entries = await this.storage.load();
          if (entries && typeof entries === 'object') {
            for (const [key, question] of Object.entries(entries)) {
              if (question && typeof question === 'object' && typeof question.kind === 'string') {
                if (this.memory.size >= this.maxEntries) break;
                this.memory.set(key, question);
              }
            }
          }
        } catch {
          // Corrupt or unavailable storage — start with an empty cache.
        } finally {
          this.hydrated = true;
        }
      })();
    }
    return this.hydratePromise;
  }

  get(key: string): SrsTestQuestion | null {
    return this.memory.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.memory.has(key);
  }

  set(key: string, question: SrsTestQuestion): void {
    this.memory.set(key, question);
    // FIFO eviction keeps the persisted cache bounded.
    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.storage) return;
    const storage = this.storage;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const entries: Record<string, SrsTestQuestion> = {};
      for (const [key, question] of this.memory) entries[key] = question;
      try {
        void storage.save(entries);
      } catch {
        // Persistence is best-effort; the in-memory cache still works.
      }
    }, 300);
  }
}

/**
 * Single-flight, priority-ordered queue of test-generation requests. Only one
 * request hits the LLM endpoint at a time; everything else waits in line.
 */
export class SrsTestManager {
  private queue: QueuedRequest[] = [];
  private inflight: QueuedRequest | null = null;
  /** Dedupe map: `${cardKey}:${kind}` → the queued/in-flight request. */
  private pending = new Map<string, QueuedRequest>();
  private nextId = 1;
  readonly cache: SrsTestCacheStore;
  private readonly onLog?: (event: string, data?: Record<string, unknown>) => void;

  constructor(
    private readonly transport: SrsTestTransport,
    options: SrsTestManagerOptions = {},
  ) {
    this.cache = new SrsTestCacheStore(options.storage);
    this.onLog = options.onLog;
  }

  /** Await cache hydration (storage load) before the first lookups. */
  ready(): Promise<void> {
    return this.cache.ready();
  }

  /**
   * Full cache/dedupe key for one test of one card. The context sentence and
   * word form are hashed in, so two users on the same device who saved the
   * same dictionary entry from different context sentences never share a
   * cached question (the question references the context).
   */
  private cacheKey(cardKey: string, input: SrsTestGenerationInput): string {
    const contextHash = md5(`${input.wordForm}|${input.context}`).slice(0, 8);
    // The pronunciation mode matters: when the app supplies a kana reading it
    // owns the correct answer and the model returns confounders only; when it
    // does not, the model also supplies the correct answer. These are different
    // questions, so they must never share a cache entry (otherwise a prefetch
    // without ground truth could collide with a grounded loadSlot).
    const gt = input.kind === 'pronunciation' ? `|gt=${input.pronunciation ?? ''}` : '';
    return `${cardKey}:${input.kind}:${contextHash}${gt}`;
  }

  private log(event: string, data?: Record<string, unknown>): void {
    this.onLog?.(event, data);
  }

  /**
   * Request one test question. Returns a cached question immediately when
   * available (unless `regenerate` is set); otherwise enqueues the request
   * behind higher-priority work and runs it through the single-flight
   * pipeline with one automatic retry.
   *
   * The returned promise always resolves (never rejects): either
   * `{ ok: true, question, fromCache }` or `{ ok: false, diagnostic }`.
   */
  async requestTest(params: SrsTestRequestParams): Promise<SrsTestRequestResult> {
    await this.ready();
    const { cardKey, priority, input } = params;
    const dedupeKey = this.cacheKey(cardKey, input);

    if (!input.regenerate) {
      const cached = this.cache.get(dedupeKey);
      if (cached) {
        this.log('cache-hit', { cardKey, kind: input.kind });
        return { ok: true, question: cached, fromCache: true };
      }
      const existing = this.pending.get(dedupeKey);
      if (existing) {
        // Reuse the identical in-flight/queued request. A higher-priority
        // caller (e.g. Start Test upgrading a prefetch) moves it up the queue.
        if (PRIORITY_RANK[priority] > PRIORITY_RANK[existing.priority]) {
          this.log('priority-upgrade', { cardKey, kind: input.kind, from: existing.priority, to: priority });
          existing.priority = priority;
          this.sortQueue();
        }
        if (params.onRetry) {
          const previous = existing.onRetry;
          existing.onRetry = previous
            ? () => { previous(); params.onRetry?.(); }
            : params.onRetry;
        }
        return existing.promise;
      }
    } else {
      // A regeneration supersedes any queued generation of the same test.
      const existing = this.pending.get(dedupeKey);
      if (existing && existing !== this.inflight) {
        this.log('supersede', { cardKey, kind: input.kind });
        this.removeRequest(existing);
        existing.resolve({
          ok: false,
          diagnostic: diagnosticFor(input.kind, '', null, 'Superseded by a newer request'),
        });
      }
    }

    let resolveRequest!: (result: SrsTestRequestResult) => void;
    const promise = new Promise<SrsTestRequestResult>((resolve) => {
      resolveRequest = resolve;
    });
    const request: QueuedRequest = {
      id: this.nextId++,
      dedupeKey,
      cardKey,
      priority,
      input,
      onRetry: params.onRetry,
      promise,
      resolve: resolveRequest,
    };
    this.pending.set(dedupeKey, request);
    this.queue.push(request);
    this.sortQueue();
    this.log('queue', {
      cardKey,
      kind: input.kind,
      priority,
      regenerate: Boolean(input.regenerate),
      queueLength: this.queue.length,
    });
    void this.pump();
    return promise;
  }

  /**
   * Cancel queued (not in-flight) prefetch requests whose cardKey is no
   * longer of interest, so stale prefetches never burn LLM tokens. The page
   * calls this with the set of cardKeys it still wants (current + next two).
   */
  cancelPrefetchesExcept(keepCardKeys: Set<string>): void {
    const remaining: QueuedRequest[] = [];
    for (const request of this.queue) {
      if (request.priority === 'prefetch' && !keepCardKeys.has(request.cardKey)) {
        request.superseded = true;
        this.pending.delete(request.dedupeKey);
        this.log('cancelled', { cardKey: request.cardKey, kind: request.input.kind });
        request.resolve({
          ok: false,
          diagnostic: diagnosticFor(request.input.kind, '', null, 'Cancelled'),
        });
      } else {
        remaining.push(request);
      }
    }
    if (remaining.length !== this.queue.length) {
      this.queue = remaining;
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  }

  private removeRequest(request: QueuedRequest): void {
    request.superseded = true;
    this.queue = this.queue.filter((r) => r !== request);
    if (this.pending.get(request.dedupeKey) === request) {
      this.pending.delete(request.dedupeKey);
    }
  }

  private async pump(): Promise<void> {
    if (this.inflight) return;
    const request = this.queue.shift();
    if (!request) return;
    this.inflight = request;
    try {
      const result = await this.generate(request);
      if (!request.superseded) request.resolve(result);
    } catch (error) {
      // generate() never throws; this is a defensive safety net.
      if (!request.superseded) {
        request.resolve({
          ok: false,
          diagnostic: diagnosticFor(
            request.input.kind,
            '',
            null,
            error instanceof Error ? error.message : String(error),
          ),
        });
      }
    } finally {
      this.inflight = null;
      if (this.pending.get(request.dedupeKey) === request) {
        this.pending.delete(request.dedupeKey);
      }
      void this.pump();
    }
  }

  private async generate(request: QueuedRequest): Promise<SrsTestRequestResult> {
    const { input, cardKey } = request;
    let lastDiagnostic: SrsTestDiagnostic | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(input, attempt);
      let response: string | null = null;
      try {
        this.log('request-start', {
          cardKey,
          kind: input.kind,
          attempt: attempt + 1,
          cache: !input.regenerate && attempt === 0,
          promptLength: prompt.length,
        });
        response = await this.transport.generate(prompt, {
          cache: !input.regenerate && attempt === 0,
        });
        this.log('response-received', {
          cardKey,
          kind: input.kind,
          attempt: attempt + 1,
          responseLength: response.length,
        });
        const question = this.parseAndValidate(response, input);
        this.cache.set(this.cacheKey(cardKey, input), question);
        return { ok: true, question, fromCache: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastDiagnostic = diagnosticFor(input.kind, prompt, response, message);
        this.log('generation-failed', {
          cardKey,
          kind: input.kind,
          attempt: attempt + 1,
          error: message,
        });
        if (attempt === 0) {
          // First failure — surface "trying again…" and retry exactly once.
          request.onRetry?.();
        }
      }
    }
    return { ok: false, diagnostic: lastDiagnostic! };
  }

  private buildPrompt(input: SrsTestGenerationInput, attempt: number): string {
    const prompt = buildSrsQuestionPrompt({
      word: input.wordForm,
      contextSentence: input.context,
      l1Code: input.l1Code,
      l2Code: input.l2Code,
      kind: input.kind,
      definition: input.definition,
      pronunciation: input.pronunciation,
    });
    const hints: string[] = [];
    if (input.regenerate || attempt > 0) {
      hints.push(`Fresh variation for attempt ${attempt + 1}; do not repeat prior output.`);
    }
    if (attempt > 0) {
      const baseL2 = (input.l2Code.split('-')[0] ?? '').toLowerCase();
      if (baseL2 === 'ja') {
        hints.push('Last output was invalid. Keep written kana fixed, vary only kanji readings, never extend/truncate the correct reading or use its derived forms, all choices distinct, valid JSON only.');
      } else if (baseL2 === 'zh' || baseL2 === 'yue') {
        hints.push('Last output was invalid. Correct pinyin with tone marks, plausible wrong tones/syllables, never contain the correct answer or use its derived forms, all choices distinct, valid JSON only.');
      } else {
        hints.push('Last output was invalid. Plausible near-miss readings, never contain the correct answer or use its derived forms, all choices distinct, valid JSON only.');
      }
    }
    return hints.length ? `${prompt}\n\n${hints.join('\n\n')}` : prompt;
  }

  private parseAndValidate(raw: string, input: SrsTestGenerationInput): SrsTestQuestion {
    const parsed = parseSrsQuestionResponse(raw);
    if (parsed.kind !== input.kind) {
      throw new Error('LLM returned the wrong question type');
    }

    // ── Pronunciation. When the app supplies a ground-truth kana reading
    // (Japanese EDICT has alternate/phonetic_detail.kana) it owns the correct
    // answer and the LLM supplies ONLY the 3 distractor readings — so the
    // correct option is never the model's guess (homographs like 反る = そる vs
    // かえる). When NO reading is available (e.g. an LLM entry with only
    // romaji), the model generates both correct_answer and confounders, so the
    // word still gets a pronunciation question. The question text is always
    // app-owned via buildPronunciationQuestionText().
    if (input.kind === 'pronunciation') {
      const baseL2 = (input.l2Code.split('-')[0] ?? '').toLowerCase();
      const groundTruth = (input.pronunciation ?? '').trim();
      const confounders = (Array.isArray(parsed.confounders) ? parsed.confounders : [])
        .filter((x): x is string => typeof x === 'string');
      let correct: string;
      let rawChoices: string[];
      if (groundTruth) {
        correct = groundTruth;
        rawChoices = [correct, ...confounders];
      } else {
        correct = typeof parsed.correct_answer === 'string' ? parsed.correct_answer.trim() : '';
        rawChoices = [parsed.correct_answer, ...confounders];
      }
      if (!correct) {
        throw new Error('Missing ground-truth pronunciation');
      }
      if (baseL2 === 'ja' && !/^[\u3040-\u309fー\s]+$/.test(correct)) {
        throw new Error('Japanese pronunciation must be hiragana');
      }
      const deduped = rawChoices
        .filter((x): x is string => typeof x === 'string' && !!x.trim())
        .filter(
          (choice, index) =>
            rawChoices.findIndex(
              (candidate) => normalizeTestChoice(candidate) === normalizeTestChoice(choice),
            ) === index,
        );
      if (deduped.length !== 4) {
        throw new Error('Invalid question choices');
      }
      const question: SrsTestQuestion = {
        kind: input.kind,
        prompt: buildPronunciationQuestionText(input.wordForm, input.l1Code),
        choices: deduped.sort(() => Math.random() - 0.5),
        correctAnswer: correct,
      };
      const problem = validateSrsPronunciationChoices(question);
      if (problem) {
        throw new Error(`Pronunciation confounders are obvious wrongs: ${problem}`);
      }
      return question;
    }

    // ── Definition: the LLM returns the question + correct_answer + confounders.
    if (typeof parsed.question !== 'string' || !parsed.question.trim()) {
      throw new Error('LLM returned an invalid question');
    }
    const confounders = Array.isArray(parsed.confounders) ? parsed.confounders : [];
    const rawChoices = [parsed.correct_answer, ...confounders].filter(
      (x): x is string => typeof x === 'string',
    );
    const choices = rawChoices
      .filter(
        (choice, index) =>
          rawChoices.findIndex(
            (candidate) => normalizeTestChoice(candidate) === normalizeTestChoice(choice),
          ) === index,
      )
      .slice(0, 4);
    if (choices.length !== 4) {
      throw new Error('Invalid question choices');
    }
    const definitionQuestion: SrsTestQuestion = {
      kind: input.kind,
      prompt: parsed.question,
      choices: choices.sort(() => Math.random() - 0.5),
      correctAnswer: parsed.correct_answer,
    };
    const definitionProblem = validateSrsDefinitionChoices(definitionQuestion);
    if (definitionProblem) {
      throw new Error(`Definition choices leak the answer by length: ${definitionProblem}`);
    }
    return definitionQuestion;
  }
}
