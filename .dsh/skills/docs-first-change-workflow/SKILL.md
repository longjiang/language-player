---
name: docs-first-change-workflow
description: Carry out a change by first reading the repository's ADRs, specs, and architecture docs; warn before implementing anything they contradict, propose documentation updates for undocumented changes, ask clarifying questions, commit after each task item, and add logging in order to obtain real diagnostic logs.
whenToUse: Use when implementing, modifying, or debugging behavior in this repository, or whenever a request could touch a documented decision, specification, or architectural boundary.
---

# Docs-first change workflow

Apply these rules in order. They are not a checklist to run at the end:
documentation review happens **before the first edit**, and a commit closes each
task item.

## 1. Read the relevant documentation before touching code

Locate every document that governs the area you are about to change, then read
it — do not judge by title.

| Source | Path | What it tells you |
|---|---|---|
| Architecture decisions (ADRs) | `docs/adr/NNNN-*.md` + `docs/adr/README.md` index | Why the architecture is the way it is, and what was explicitly rejected |
| Feature specifications | `docs/specs/NNN-*.md` | Intended behavior, flows, acceptance criteria, data model |
| As-built architecture | `docs/arch/NNN-*.md` | How the system actually works today |
| Project rules | `AGENTS.md` | Mandatory conventions for logging, i18n, builds, commits, boundaries |
| Roadmap | `ROADMAP.md` | Whether this change is already planned, in progress, or finished |

Narrow the set first; do not read the whole corpus:

```bash
ls docs/adr docs/specs docs/arch
grep -ril "<feature, subsystem, endpoint, table>" docs/adr docs/specs docs/arch
```

For anything ported or reimplemented, `AGENTS.md` § Critical Architecture Rules
also names the reference source (the Nuxt Classic app) that describes intended
feature behavior — read it before writing the replacement.

Record the verdict per document: **consistent**, **contradicts**, or **silent**.
Carry the exact file path (and section/line) into the next step and into your
report to the user.

## 2. Surface contradictions and gaps explicitly

### 2.1 If the requested change contradicts documentation — warn before implementing

Stop before writing code and tell the user:

- the document and the exact passage that governs the behavior,
- the specific conflict, in one or two sentences (documented behavior vs.
  requested behavior),
- the options: keep the documented behavior; change the documentation first
  (new ADR superseding the old one, or an amended spec); or make a scoped,
  explicitly temporary exception with a dated TODO and tracked follow-up.

Do not implement "the spirit" of a request that contradicts a decision record,
and do not silently treat stale documentation as permission. Wait for the
user's decision, then follow it.

### 2.2 If the change is not documented — propose an update

Say plainly that no ADR, spec, or arch doc covers the change, then propose the
smallest sufficient artifact:

| Change | Documentation to add or update |
|---|---|
| New architectural decision (dependency, boundary, storage, protocol, auth flow) | New `docs/adr/NNNN-*.md`; add the Metadata block (Date, Status) and a row in `docs/adr/README.md` |
| New or changed user-visible behavior | New `docs/specs/NNN-*.md` (start from `_template.md`), or amend the existing related spec |
| Reality drifting from the as-built description | `docs/arch/NNN-*.md` (start from `_template.md`) |
| Completing a planned task | `ROADMAP.md` |
| User-facing help content | `apps/web/content/docs/`, plus translation regeneration per `AGENTS.md` § Writing User-Facing Documentation |

Show the outline or proposed diff — not a vague promise to "update docs later."
Check for an existing doc to amend before creating a new number. If the user
declines the update, implement anyway only with their explicit agreement and
state the unrecorded gap in your final report.

Documentation updates belong to the **same task item** and the **same commit**
as the behavior they describe (`AGENTS.md` § When You Make Changes).

## 3. Ask when a decision is genuinely the user's

Ask when:

- the requirement is ambiguous about observable behavior,
- documentation conflicts (see rule 2.1),
- a choice has a lasting architectural consequence (new dependency, schema or
  API change, boundary crossing, pricing/i18n behavior),
- required access, credentials, data, or environment is missing,
- the action is destructive or expensive (builds, migrations, deleting data,
  force-push).

Do not ask what you can determine yourself: read the code, docs, config, and
schema; run read-only commands; inspect process, build, and git state.

Batch questions into one numbered list, each with a recommended default, so a
single reply unblocks the work. Be concrete:

> Should the new counter use `usage_events` (SPEC-039) or `users.credits`
> (current code)? Recommended: `usage_events`, which matches the documented
> event-sourced model.

Never make the user your diagnostic instrument for something you can observe
yourself (see rule 5).

## 4. Commit after each task item

A **task item** is a unit from the user's list or the agreed plan — for example
"add the endpoint, its client call, and its test" — not a file and not a
fix-up commit.

Before each commit:

1. Re-check the item's acceptance criteria; finish it rather than committing
   something "mostly done".
2. Run the required checks for what you touched: `npx turbo typecheck`, and
   `npm run build:check -w apps/web` when web code changed. Do not run a
   production/native build without explicit consent (`AGENTS.md` § Commands).
3. Inspect `git status` and `git diff`; stage only files belonging to this
   item and leave unrelated work-in-progress unstaged.
4. Include the rule-2 documentation change in the same commit.
5. Never push.

Rules:

- Do not batch several task items into one commit, and do not amend commits you
  did not create. If the user wants a single commit, confirm that deviation
  explicitly.
- The legacy repositories are reference-only and gitignored from this monorepo.
  If a change inside one is truly required, `cd` into it and commit there.
- Commit messages: `<area>: <imperative summary>`, then a body stating why,
  the behavior change, and the governing `ADR-NNNN` / `SPEC-NNN`.
- If a check fails, fix it within the same item; never commit red.

After the commit, report the hash and move to the next item.

## 5. Diagnose with logs, not hypotheses

When a problem cannot be confirmed by reading code, instrument it before
changing it. `AGENTS.md` § Debugging & Verification applies.

1. **Add logging where the truth is decided** — the values loaded and received,
   and every branch taken, including skips, no-ops, and fallbacks.
2. **Use the app logger, never bare `console`.** `log()` / `logwarn()` /
   `logerr()` from the app's `lib/logger.ts`, with the bracketed prefix first:
   `[LP Web]`, `[LP Mobile]`, `[LP Admin]`, `[LP Extension]`. All output is
   gated by the app-wide `LOG_LEVEL`. `log()` is the default, including for
   debugging traces; reserve `logwarn()`/`logerr()` for real errors that need a
   stack trace and flag them with `// non-info-level: <reason — stack trace
   needed>`.
3. **Log the actual value**, not a guess:
   `log('[LP Web] response keys:', Object.keys(res), JSON.stringify(res).slice(0, 200))`.
4. **Confirm from the logs before fixing.** Do not change behavior on a
   hypothesis the logs have not confirmed. After the fix, re-check the same
   logs before calling it done.
5. **Then ask the user for the logs** — after the instrumentation exists, not
   instead of it. Give the exact reproduction steps, the level to enable
   (`NEXT_PUBLIC_LOG_LEVEL=3`, `EXPO_PUBLIC_LOG_LEVEL=3`, or `setLogLevel(3)`),
   the console filter (Verbose/All), and the specific lines to send. For long
   sessions, tee output to a file (e.g. `/tmp/metro.log`) so history survives.
6. **Never start or stop the Flask server** — ask the user, and never start a
   second Metro/Next/Nuxt instance; check the port first and use the documented
   scripts.
7. **Verify you are testing what the user is running.** Check bundle/build
   timestamps, reload markers, and cache state before trusting any log.

Diagnostic logging added for a bug is removed or demoted in the commit that
fixes it, unless it is generally useful at `LOG_LEVEL=3`.

## Order of work

- [ ] Documentation located and read; per-document verdict recorded
- [ ] Contradictions surfaced, or the documentation gap proposed and approved
- [ ] Clarifying questions answered (batched, with defaults)
- [ ] Work split into task items — confirmed if the user did not list them
- [ ] Per item: implement → checks → doc update → commit → report hash
- [ ] Diagnostics: logging added → logs requested with exact repro → problem
      confirmed → fixed → same logs re-checked

## Report back

- Documents consulted, with paths.
- Consistency verdict: consistent / contradicted (resolved how) / undocumented
  (what was added).
- Commits: hash + subject, one per task item.
- Open questions, deviations, and known gaps.
