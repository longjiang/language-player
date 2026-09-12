# ADR-0045 — Mock apps are sandboxed, self-contained HTML behind a frozen bridge

**Status:** Accepted (2026-09-11)

## Context

SPEC-095 needs a "mock app" stimulus: a realistic, interactive imitation of a real-world app that a task is performed against. The pilot case is the Railway 12306 ticket app (B ➍), and the roadmap immediately implies a hotel booking flow and an ATM task that has to mock a physical cash dispenser. These UIs have almost nothing in common, and each needs its own mock branding to feel like the real thing.

Three behaviours must nonetheless be **identical** across every mock app, because they are what makes a mock app a textbook exercise rather than a toy:

1. **Help mode** — the student toggles it on and the app's words become tappable tokens (with lemmas, without ruby), opening the same popup dictionary used everywhere else.
2. **Evaluation** — the app knows whether the student completed the task ("pick the fastest train" → correct when the fastest is picked).
3. **Hint** — a button highlights the first element the student should tap, which requires that a completion path genuinely exists for each answer.

The question is how to let each app be unique while sharing those three, without the host accumulating per-app code.

Two shapes were rejected before this decision:

- **A host-side declarative renderer** (a screen spec the host draws: tabs, rows, detail sheets). Its schema would have to grow a union of every app's UI, and it still cannot express a cash dispenser without a bespoke escape hatch. That is precisely the code bloat this decision exists to avoid.
- **A bespoke React/RN component per mock app.** It keeps design freedom but puts host code, host review burden, and translation keys on the critical path of every new app, and it gives up CSS isolation — so a mock app's branding can leak into the app shell, which AGENTS.md rule 6 deliberately forbids for LP's own chrome.

Relevant existing facts, verified rather than assumed:

- **Web has no iframe host today** — the only iframes are YouTube embeds (`apps/web/src/components/video/youtube-player.tsx`). So the frame is new on web.
- **Mobile already has everything needed.** `react-native-webview@13.16.1` is a dependency; `apps/mobile/components/WebViewSheet.tsx` is a usable sheet shell; and `apps/mobile/components/TokenizationWorkerHost.tsx` is an existing host↔WebView `onMessage` bridge worth copying conventions from.
- **The dictionary popup is already reusable as-is.** `DictionaryPopupProps` is `{ token, l1Code, l2Code, position, context, linkUrl, onOpenLink, extractPhrases, onClose }` (`apps/web/src/components/dictionary-popup.tsx:32`) — rect-anchored and context-free, which is exactly what a bridge carries. The only obstacle is that the anchoring state currently lives inside `TokenizedText` rather than in a provider.
- **The host is the tokenization authority**, because web has no client-side tokenizer at all. Mock apps must not tokenize independently or they would bypass `lemmatizeCache` and the batch queue.
- **ADR-0043 covers media, not code.** Mock app HTML is code.

## Decision

**Each mock app is a self-contained HTML file — the one-page-app model — loaded in a sandboxed, same-origin frame, and driven by a frozen, versioned bridge contract. The shared behaviour lives in a runtime script and the contract, never in a per-app host component.**

1. **Three layers, and only one of them grows.**

   | Layer | Where | Grows per new app? |
   |---|---|---|
   | `MockAppFrame` (frame, bridge, TaskShell integration, host chrome) | `apps/web` iframe, `apps/mobile` WebView | No |
   | `mock-app-runtime.js` (help mode, token rendering, hint, progress, completion) | repo, same-origin, version-pinned | No |
   | The app (HTML/CSS, dataset, goals, `mount`) | one file per app | Yes — irreducible |

   Adding an app costs zero host code, zero content-schema fields and zero translation keys.

2. **A frozen, versioned bridge contract**, transport-agnostic so the same protocol rides web `postMessage` and RN WebView. Host → app: `init`, `help-mode`, `hint`, `reset`, `tokens`. App → host: `ready`, `tokenize`, `lookup`, `progress`, `complete`, `resize`. The frame **refuses a mismatched major version**.

3. **Goals are acceptance predicates over the app's own dataset, not hardcoded answers.** The runtime derives all three shared behaviours from that one declaration: evaluation (all goals met), progress (`done / total`), and hint (the candidate elements of the first unmet goal). A completion path therefore is not a separate authored asset — it is the goal list read in order. A mock app may declare **no goals** (a pure stimulus); `complete` is optional.

4. **Help mode keeps the host as tokenization authority.** The app sends its tokenizable strings in one `tokenize` message; the host resolves them through the existing `/lemmatize-normalized/batch` pipeline plus `lemmatizeCache` and returns a token map; the runtime wraps text nodes in spans with lemmas and no ruby. A tap sends `lookup` and the host renders the **existing `DictionaryPopup`**, not a lookalike. Non-vocabulary strings (prices, times, train numbers) are excluded via CJK auto-detection plus a `data-no-tokenize` opt-out.

5. **Sandbox with `allow-scripts` and *not* `allow-same-origin`.** The app runs on an opaque origin, so `postMessage` is the only channel and it can reach neither host cookies nor the host DOM. A consequence to accept: a sandboxed app cannot `fetch` the API, which is fine because tokens arrive by message.

6. **Hosted same-origin from the repository, as reviewed source.** Mock apps are code, not media, so ADR-0043 does not apply to the HTML itself. This matters because these files will largely be LLM-generated: executable code shipping inside the app must be reviewed and versioned in git, never fetched from a mutable URL at runtime. Media *inside* an app still uses the asset host via `ASSET_BASE_URL`, but mock chrome and branding should prefer inline SVG/CSS so most apps stay genuinely one file.

7. **Mock apps intentionally hardcode brand colors.** This is an explicit carve-out from AGENTS.md rule 6, scoped to the frame: a mock app is diegetic content imitating a third-party product, not LP chrome. It must not be "fixed" to use semantic tokens. CSS isolation is part of why the frame exists.

8. **Third-party libraries loaded via `<script>`/`<link>` are allowlisted and pinned, or vendored.** Each remote tag is a supply-chain surface, a runtime dependency, and an origin the sandbox CSP must explicitly permit.

9. **The screen and the answer key cannot drift.** The host cannot verify a goal it cannot evaluate, so the cross-check moves to authoring time: each app declares its derived expected answers and the validator compares them against the content answer key. A build cannot execute the app's JS, but it can compare two declared values.

10. **Mock app text is content, not UI copy.** A Chinese railway app is in Chinese, so its strings do not belong in `translations.csv` — only the host chrome (help-mode and hint controls) does.

## Consequences

- **UI variety is unbounded.** A hotel booking screen, a cash dispenser, anything else: the host needs no changes, and none of it has to fit a schema.
- **Branding cannot leak.** Real CSS/JS isolation is what makes per-app mock branding safe next to LP's semantic-token chrome.
- **The floor per app is genuinely low** — a dataset, a few predicates and a `mount` function — and SPEC-095 requires a "hello world" mock app in Phase 2 to *prove* that floor before a real app is authored. If it does not hold, this decision should be revisited rather than papered over.
- **Two transports must be maintained.** Web `postMessage` is structured and synchronous-ish; RN WebView's is string-only and async, and host→app uses `injectJavaScript`. One shared interface with a per-platform adapter contains this (ADR-0003), but it is real work and it is why mobile is not free.
- **A small refactor is a prerequisite, not a follow-up.** Token-anchored popup state lives inside `TokenizedText`; the bridge needs a popup-host provider both call. Until that exists, help mode cannot show *the same* popup.
- **Coordinate mapping is required.** A token rect from inside the frame must be translated to host viewport coordinates (frame offset plus token rect). Getting this wrong misplaces the popup rather than failing loudly.
- **LLM-generated code is a review obligation.** Committing these as source is the mitigation, but a reviewer must actually read them; the validator catches structure (missing hooks, off-allowlist libraries, answer disagreement), not intent.
- **Accessibility and input parity are unresolved** by this decision: a mock app is a small phone UI inside a frame, and keyboard/AT behaviour has to be specified per app rather than inherited.
- **CSP and allowlist maintenance** become ongoing chores, and a newly needed library is now a two-step change (allowlist + CSP) rather than an import.
- **Frame overhead** (an iframe or WebView per task) is accepted for isolation; `resize` reporting is in the contract so the frame can size to content.

## Alternatives Considered

- **Host-side declarative renderer.** Smallest conceptual surface and no iframe, but its schema converges on a union of every app's UI and still needs bespoke escape hatches for things like a cash dispenser. Rejected as the bloat this decision avoids.
- **A bespoke React/RN component per mock app.** Maximum design control and no bridge, but host code, host review, translation keys and CSS-leak risk on every new app — and it makes the host the owner of every mock app's internals.
- **Screenshot plus blanks in `TaskShell`** (the literal workbook experience). Simplest, but it removes the interactivity that is the entire point of the feature, and it is what the mock app exists to replace.
- **Serve mock app HTML from the asset host (ADR-0043) at runtime.** Consistent with media hosting, but it makes executable code a mutable, remotely-fetched dependency, adds a cross-origin CORS surface, and puts code outside git review.
- **Sandbox with `allow-same-origin`** so the host can reach into the frame's DOM directly and skip `postMessage`. Rejected: it trades away the isolation that justifies the frame, and gives an LLM-authored document the host's origin.
