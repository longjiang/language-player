# Feature Specification: Email Verification Support Pipe — sender matching, LLM triage, and outcome notifications

## Metadata
- **Spec ID**: SPEC-110
- **Feature**: `verify_email@zerotohero.ca` support pipe (`auto_verify_email.py`) — repair, sender-identity hardening, and success/failure notifications
- **Status**: draft — awaiting approval before implementation
- **Created**: 2026-11-11
- **ROADMAP Phase**: Phase 9: Backend Consolidation (auth/support tooling)
- **Governing docs**: [SPEC-039 § M5](../specs/039-full-database-migration-supabase.md), [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md)
- **Supersedes**: the undocumented sender-matching behavior in `auto_verify_email.py` (no prior spec)

## Privacy note

Every address, name, and id in this spec is synthetic (`sender@example.com`,
`student@university.example`, `<uuid>`). The real support case is described
without any user identifier: this repository is public, and support
correspondence is not. See `AGENTS.md` § "When You Make Changes" (docs
hygiene).

## Overview

When a user cannot verify their email, the verification screen offers a
pre-composed email to `jon.long@zerotohero.ca`. Jon forwards that message to
`verify_email@zerotohero.ca`; DreamHost's filter hands it to the shell account
`dh_rqe96h`, whose `~/.forward.postfix` pipes the raw message into
`auto_verify_email.py`. The script parses the message, confirms the account
through the GoTrue admin API, runs the same trial + MailerLite hook as
`/auth/verify-email`, and replies to the user.

Two things are wrong with that pipe today.

1. **It is not running.** The pipe line invokes `/usr/bin/python3` (system
   Python 3.14.4), which cannot import `dotenv`, so every forwarded message
   dies at import with exit code 1 and a postfix bounce. No
   `logs/email_processing.log` exists on the production host, so the pipe has
   recorded no processed message there. The GoTrue migration (SPEC-039 M5) was
   correct; the **deployment** was not updated with it.
2. **Its identity check does not mean what it appears to mean.** The extraction
   regex returns the *first* address in the body
   ([`auto_verify_email.py:64`](../../zerotohero-python-server/auto_verify_email.py:64)).
   In a forwarded message that is the quoted `From:` line — the sender's own
   mailbox, not the address they asked us to verify. And once a message is
   recognised as Jon's forward, the match check is skipped entirely
   ([`auto_verify_email.py:243`](../../zerotohero-python-server/auto_verify_email.py:243)),
   so any address mentioned anywhere in the body is confirmed without proof
   that the requester controls it.

This spec repairs the pipe and replaces address identification with an
LLM-assisted, fail-closed flow that verifies a user only when the address they
want confirmed is the mailbox they wrote from, and notifies both addresses plus
Jon on every outcome.

## What we verified (2026-11-11)

### The GoTrue code path is correct

| Check | Result |
|---|---|
| `python3.10 -m pytest test_auto_verify_email.py` | 4 passed |
| `usub._user_by_email(<a real account; address omitted>)` against production Supabase | resolves to the matching `auth.users` row |
| `GET /auth/v1/admin/users/<id>` with `SUPABASE_SECRET_KEY` | HTTP 200; `email_confirmed_at` set |
| Production `.env` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DEEPSEEK_API_KEY` all present and non-empty |
| Production checkout | script at commit `57b89c1` (the M5 GoTrue rewrite) is checked out |

The real case behind this spec was confirmed two minutes after the message, so the admin
confirm + enrollment logic itself works.

### The pipe itself is dead

| Check | Result |
|---|---|
| `~/.forward.postfix` | `"\| /usr/bin/python3 …/auto_verify_email.py"` (unchanged since 2024-06-16) |
| `/usr/bin/python3 --version` | 3.14.4 |
| `import requests, psycopg2` in system Python | OK |
| `import dotenv` in system Python | **ModuleNotFoundError** |
| `printf … \| /usr/bin/python3 auto_verify_email.py` | **fails at line 34**, exit 1 |
| `./venv/bin/python -c "import auto_verify_email"` | **IMPORT OK** (venv is Python 3.10.22) |
| `logs/email_processing.log` | **does not exist** |

Consequence: forwarded verification requests now bounce back to Jon, and the
host holds no log of any message this pipe has processed. The automation is not
"still working"; it is silently off, and the M5 code is the only part that
survived the upgrade.

### Reproduced extraction defect

Replaying the real message with synthetic addresses (outer `From: jon.long@zerotohero.ca`,
forwarded block `发件人: Example User <sender@example.com>`,
body `My email address is: student@university.example`):

```
from: jon.long@zerotohero.ca
extracted: sender@example.com   ← the quoted sender, not the requested address
```

The forwarded branch then passes that address straight to
`confirm_user_and_enroll` with no comparison, because the branch bypasses
`handle_mismatch`. A correct implementation would never confirm an address the
sender does not control.

## Goals

1. The pipe runs on every forwarded message, using the deployed virtualenv, and
   records what it did even when it fails.
2. Auto-verification happens **only** when the address to confirm is the same
   mailbox the request came from, including when the request arrives as a
   forward inside Jon's mailbox.
3. An LLM identifies the requester and the requested address; deterministic
   code — not the LLM — makes the security decision.
4. Every outcome notifies the requester via both addresses and Jon, in one
   thread that carries the requesters' previous messages.
5. When the rule cannot be satisfied, the pipe asks the requester to reply from
   the address they want verified, and escalates on the next failure instead of
   verifying.

## Non-goals

- Changing GoTrue, `/auth/verify-email`, or the trial/MailerLite hook.
- Creating accounts, resetting passwords, or editing emails on the user's behalf.
- Adding the "Having trouble?" contact link to the Next.js register page — it
  exists only in Classic (`zerotohero-nuxt/pages/verify-email.vue:42`), so the
  web app currently has no mailto at all. Tracked as a follow-up, not part of
  this spec.
- Replacing the DreamHost mail plumbing (mailbox filter → shell account →
  `.forward.postfix`).

## Decisions taken (2026-11-11)

| # | Decision | Rationale |
|---|---|---|
| D1 | LLM decides *who wrote* and *what address to verify*; regex + `email.utils` cross-check every address it returns; code decides whether to verify | The failure is address identification in free text and forwarded headers, not policy. The LLM is good at the former and must not be trusted with the latter |
| D2 | One email per outcome: `To:` both addresses (deduped, omitted when identical), `Cc:` `jon.long@zerotohero.ca` | Single thread, no duplicate copies, Jon always sees the exact message the user received |
| D3 | On a mismatch, do not verify: reply asking the requester to reply from the address they want verified, `Cc` Jon; on the next failed attempt, escalate to a human | Fail closed, and give the user a path that the pipe can complete automatically on retry |
| D4 | Every outbound mail quotes all previous requester messages in the thread and sets `In-Reply-To`/`References` | Jon and the user both see the whole history without searching; mail clients thread it correctly |
| D5 | Spec first; implementation follows approval | The LLM dependency, notification copy, and state store are user-visible choices |

## As-built flow (today)

```
user → jon.long@ (precomposed mailto from Classic verify-email page)
jon  → verify_email@ (forward)
     → DreamHost filter → shell account dh_rqe96h
     → ~/.forward.postfix → /usr/bin/python3 auto_verify_email.py  ← currently fails
     → regex first email in body → confirm_user_and_enroll
     → GoTrue admin PUT email_confirm:true → grant_trial_and_enroll_mailerlite
     → reply (From jon.long@, Bcc jon.long@)
```

## Target flow

```
stdin (raw MIME)
  1. intake        parse headers/body; detect direct vs forwarded; loop + auto-reply guards
  2. identify      LLM returns {sender, requested, intent, confidence}; regex cross-check
  3. match         requested == sender (case-insensitive, exact) → eligible
  4. decide        VERIFIED | ALREADY_VERIFIED | MISMATCH_RETRY | ESCALATE |
                   NO_ACCOUNT | GOTRUE_ERROR | UNPARSEABLE | IGNORED
  5. act           GoTrue admin confirm + trial/MailerLite (only for VERIFIED*)
  6. notify        one threaded email: To both addresses, Cc Jon, quoted history
  7. record        structured log line per stage + thread state update
```

### 1. Intake

- Prefer the `text/plain` part; fall back to a tag-stripped `text/html` part.
  Never send attachments to the LLM.
- Record `Message-ID`, `Date`, `Subject`, `From`, `Reply-To`,
  `Auto-Submitted`, `To`, `Delivered-To`, `X-Original-To`.
- **Forwarded** when any of: subject matches
  `^\s*((re|fw|fwd|aw|wg|vs|enc)\s*:\s*)+` *and* the body contains a forward
  marker (`---------- Forwarded message ---------`, `下面是被转发的邮件`,
  `Weitergeleitete Nachricht`, `Message transféré`, `転送されたメッセージ`,
  `전달된 메시지`), **or** the top-level `From` is
  `jon.long@zerotohero.ca` *and* the body contains a quoted header block.
- **IGNORED** (log and exit 0, send nothing) when: `From` starts with
  `mailer-daemon`/`postmaster`; `Auto-Submitted` is present and not `no`;
  `From` is our own support sender and the message is not forwarded; the body
  is empty; the subject matches neither `Email Verification Issue` nor a
  forward prefix (preserves today's subject filter).
- Transient infrastructure failures (DB down, config missing) exit **75**
  (`EX_TEMPFAIL`) so postfix retries instead of bouncing.

### 2. Identify (LLM + cross-check)

Call DeepSeek through the existing client (`app_chatgpt.ask`, model
`deepseek-v4-flash`, overridable with `AUTO_VERIFY_LLM_MODEL`), with a strict
JSON-only prompt. Input: subject, top-level `From`, the first 8,000 characters
of plain text, and the deduplicated list of addresses the regex found. The
message content leaves our infrastructure for this call — accepted, consistent
with the existing `/dictionary/lookup` and translation paths.

Required output:

```json
{
  "intent": "verify_email | other | unclear",
  "requester_email": "address the message was actually sent from",
  "requested_verification_email": "address the user wants confirmed",
  "is_forwarded": true,
  "explains_mismatch": false,
  "confidence": 0.0
}
```

Cross-checks applied to the LLM output, in order:

1. Every address must parse as an RFC 5322 addr-spec.
2. Every address must appear verbatim (case-insensitive) in the raw message —
   a fabricated address is discarded, and the field is treated as missing.
3. For a forwarded message, `requester_email` must appear inside the quoted
   header block (the nearest `From:`/`发件人:`/`Von:`/`De:` line after the
   first forward marker). Jon's address is transport, never the requester.
4. For a direct message, `requester_email` must equal the top-level `From`.

If the call fails, times out (20 s, no retry), or returns invalid JSON, fall
through to the deterministic path below and mark `llm=unavailable` in the log
and on Jon's copy.

### 3. Deterministic fallback (no LLM)

- `requester_email` = quoted header-block sender (forwarded) or top-level `From`.
- Remove the quoted header block and everything after a reply-attribution line,
  then collect addresses from the remaining body.
- Exactly one address → that is `requested_verification_email`.
- Zero or more than one → **UNPARSEABLE** (never guess).
- The same match rule then applies. This is safe without an LLM: a match means
  the requester controls the mailbox, and a mismatch never verifies.

### 4. Match rule

```
normalize(a) = a.strip().strip("<>").lower()
eligible    = normalize(requested) == normalize(requester)
```

Exact equality only. No Gmail dot/plus normalisation: treating `a.b@x` as
`ab@x` or `a+tag@x` as `a@x` would let an alias confirm an address the
requester may not own, and the retry email makes the exact match achievable.
`requested` must also exist in `auth.users` (`_user_by_email`), otherwise
**NO_ACCOUNT**.

### 5. Decision table

| Condition | Decision | Verify? | Notify |
|---|---|---|---|
| LLM `intent=other` or no address identifiable | UNPARSEABLE | no | reply asking for the address, Cc Jon |
| `requested != requester`, first failure in this thread | MISMATCH_RETRY | no | reply: "reply from `<requested>`", To both, Cc Jon |
| `requested != requester`, second or later failure | ESCALATE | no | reply: human will follow up; internal case summary to Jon |
| Match, no `auth.users` row | NO_ACCOUNT | no | To requester + Jon (see § 6 note) |
| Match, GoTrue non-2xx / unreachable | GOTRUE_ERROR | no | To both, Cc Jon, with the HTTP status |
| Match, `email_confirmed_at` already set | ALREADY_VERIFIED | no-op | "already verified, just log in", To both, Cc Jon |
| Match, admin confirm 2xx | VERIFIED | yes | "verified, log in", To both, Cc Jon |
| LLM low confidence but exactly one body address **and** it equals `requester` | VERIFIED | yes | as above; `llm=low_conf` recorded |

"First/second failure" is tracked per thread in § 7. `VERIFIED` always runs the
trial + MailerLite hook; the hook is idempotent (it grants a trial only when the
user has no subscription) and its failures never change the outcome.

### 6. Notification matrix

| Field | Value |
|---|---|
| `From` | `jon.long@zerotohero.ca` (unchanged; DKIM-aligned with DreamHost) |
| `Reply-To` | `jon.long@zerotohero.ca` |
| `To` | requester address **and** requested address, deduplicated, omitted when equal |
| `Cc` | `jon.long@zerotohero.ca` |
| `Subject` | `Re: <subject with repeated Re:/Fwd: prefixes collapsed>` |
| `In-Reply-To` | latest inbound `Message-ID` |
| `References` | all inbound `Message-ID`s in the thread, in order |
| `Message-ID` | `<uuid@zerotohero.ca>` (generated, recorded) |
| Body | outcome paragraph, next step, then every stored requester message quoted (`> `) with `On <date>, <from> wrote:` |
| Headers | `Auto-Submitted: auto-replied` so mail loops stop |

**One deliberate exception to "both addresses":** when `requested` is not a
registered account (NO_ACCOUNT), the requested address is *not* mailed. Without
it, the pipe is an open relay that will send our branded mail to any address a
stranger types into a body. The requester and Jon are still notified, and Jon's
copy states that the requested address has no account. All other outcomes mail
both addresses.

Delivery is best-effort per recipient: one failure is logged and does not stop
the other recipient or the GoTrue action.

### 7. Thread state

Store one JSON document per thread under
`$HOME/.local/state/languageplayer/email_verification/<sha256(primary)>.json`
(directory overridable with `AUTO_VERIFY_STATE_DIR`). If the directory is not
writable, degrade to quoting only the current message and log a warning — never
fail the run over state.

```json
{
  "thread_id": "uuid",
  "created": "iso8601",
  "updated": "iso8601",
  "requester": "sender@example.com",
  "requested": "student@university.example",
  "attempts": 1,
  "status": "mismatch|verified|escalated|no_account|error",
  "messages": [
    {"message_id": "…", "date": "…", "from": "…", "subject": "…",
     "text": "first 20 KB of plain text"}
  ],
  "outbound": [
    {"message_id": "…", "to": ["…"], "cc": ["…"], "outcome": "…", "date": "…"}
  ]
}
```

Rules: max 10 stored messages (oldest dropped), 20 KB per body, 90-day expiry
pruned on write, atomic replace (write temp + `os.replace`). The file is plain
text containing user correspondence — restrict permissions to `0600` and keep
it out of the git checkout (it lives in `$HOME`, not in
`/home/dh_rqe96h/zerotohero-python`).

### 8. Logging

Keep the existing `logs/email_processing.log`, one structured line per stage:

```
2026-11-11T07:20:01Z [intake] id=<msg-id> from=<addr> subject="Fwd: Email Verification Issue" forwarded=1
2026-11-11T07:20:01Z [llm] model=deepseek-v4-flash ms=842 confidence=0.93 requester=<addr> requested=<addr> intent=verify_email
2026-11-11T07:20:01Z [match] requester=<addr> requested=<addr> eligible=0
2026-11-11T07:20:01Z [decision] MISMATCH_RETRY attempts=1 account_exists=1
2026-11-11T07:20:02Z [notify] out=<msg-id> to=[a,b] cc=[jon] outcome=MISMATCH_RETRY
2026-11-11T07:20:02Z [done] status=mismatch
```

Also log LLM failures, guard rejections (fabricated/invalid address), sendmail
exit codes, state-store degradations, and every branch that skips work. Never
log `SUPABASE_SECRET_KEY` or full LLM prompts containing more than the first
500 characters of body text.

### 9. Deployment repair (do this first, independent of § 2–7)

The GoTrue rewrite already shipped; the pipe line did not. Required:

1. Add `auto_verify_email.sh` in the backend checkout:

   ```sh
   #!/bin/sh
   cd /home/dh_rqe96h/zerotohero-python || exit 75
   exec ./venv/bin/python auto_verify_email.py 2>> logs/email_processing.err
   ```

2. Point `~/.forward.postfix` at it (server-only file, not in git):

   ```
   "| /home/dh_rqe96h/zerotohero-python/auto_verify_email.sh"
   ```

3. Add `--selfcheck`: imports resolve, `.env` keys non-empty, DB reachable,
   GoTrue admin `GET /auth/v1/admin/users?per_page=1` returns 200, state dir
   writable, `/usr/sbin/sendmail` exists. Non-zero exit and a readable message
   on failure; run it after every deploy.
4. Startup guard: if the venv, `.env`, or GoTrue is unavailable, write the
   reason to the log and exit 75 (retry), not 1 (bounce).
5. Log rotation for `email_processing.log` (DreamHost cron or `logrotate`) so
   the file does not grow unbounded like `application.log` (2.5 GB today).

Verify by forwarding one real message and confirming both
`logs/email_processing.log` and a reply in Jon's mailbox.

## Security & abuse controls

- The LLM never sees or sets `eligible`; it only proposes addresses that the
  cross-checks and the equality rule then judge.
- Fail closed on every ambiguity: no address, two candidate addresses, LLM
  unavailable with multiple body addresses, unreadable state, invalid output.
- A fabricated address cannot pass the verbatim-in-message check.
- Rate limit per sender: max 3 outbound mails per address per 24 h, enforced
  from the thread store; beyond that, log and stay silent (avoids mail-bomb
  amplification through the pipe).
- `Auto-Submitted: auto-replied` on outbound mail; `Auto-Submitted` and
  `mailer-daemon` guards on inbound.
- Only `auth.users` addresses receive the requested-address copy (§ 6).
- No credentials, tokens, or full message bodies in logs; state files `0600`.

## Tests

Unit (pytest, no network — extend `test_auto_verify_email.py`):

1. Forwarded Gmail, Outlook, Apple Mail, and Chinese (`发件人:`) headers →
   correct `requester` and `requested`.
2. The real message (synthetic addresses) → `MISMATCH_RETRY`, GoTrue never called.
3. Direct message where `From == body address` → `VERIFIED`.
4. Direct message where they differ → `MISMATCH_RETRY`, then `ESCALATE` on the
   second attempt.
5. LLM returns an address absent from the message → discarded → UNPARSEABLE.
6. LLM returns invalid JSON / times out → deterministic fallback, same
   decisions as 2–4.
7. Decision table coverage: NO_ACCOUNT, GOTRUE_ERROR, ALREADY_VERIFIED.
8. Notification recipients: dedupe when addresses match, both when they differ,
   Jon always `Cc`, requested address skipped for NO_ACCOUNT.
9. Threading: `In-Reply-To`/`References` chain, quoted history contains every
   stored message, `0600` permissions.
10. Loop guards: `mailer-daemon`, `Auto-Submitted`, our own address.
11. Self-check reports each failure mode.

Existing `confirm_user_and_enroll` tests stay green unchanged.

Dry run for replay: `AUTO_VERIFY_DRY_RUN=1` runs intake → decision → notification
composition, writes the would-be emails and the decision to a temp directory,
and never calls GoTrue or sendmail. Used to replay real messages in review.

## Acceptance criteria

1. `--selfcheck` passes on the production host; the pipe line uses the venv.
2. Forwarding the real message produces `MISMATCH_RETRY`, **does not**
   confirm any address, and notifies the requester at both addresses with Jon
   `Cc`'d.
3. Replying from `student@university.example` to that thread confirms the
   account exactly once, grants the trial if none exists, and replies with
   "verified" in the same thread.
4. A second mismatch escalates instead of verifying; Jon's copy names the
   addresses and the attempts.
5. Killing the LLM key (`DEEPSEEK_API_KEY=`) leaves the pipe functional with
   the deterministic path and identical security behavior.
6. `logs/email_processing.log` gains one line per stage for every run, and a
   forced import failure is recorded in `email_processing.err` rather than
   bouncing silently.
7. No forwarded message reaches `confirm_user_and_enroll` without
   `requested == requester`.

## Rollout

| Phase | Work | Gate |
|---|---|---|
| A (P0, today) | Wrapper script, `.forward.postfix`, `--selfcheck`, startup guard, log rotation | One real forward processed end-to-end |
| B | Intake/forwarded detection, LLM identify + cross-check, match rule, decision table, thread store, notification matrix | Tests in § Tests green; dry-run replays of 5 real messages reviewed |
| C | Docs: correct ARCH-003, record the as-built in this spec, add the Next.js contact-link gap to the roadmap | Review |

Phase A is independent: it can ship before any hardening and restores the
capability the user already believes is on.

## Open questions

1. Is the DreamHost mailbox filter for `verify_email@` still forwarding to the
   shell account? The shell side is confirmed; the panel side is not readable
   from here.
2. Should the requested address be mailed when no account exists? Proposed: no
   (§ 6), to keep the pipe from being an open relay.
3. `From:` should perhaps become `Language Player Support
   <support@zerotohero.ca>` once SPF/DKIM for that sender is confirmed. Current
   proposal keeps `jon.long@zerotohero.ca`.
4. Retention: 90 days for thread state — acceptable?
5. Escalation threshold: first mismatch → retry, second → escalate. Should a
   clearly explained mismatch (e.g. "I lost access to the school inbox") skip
   straight to escalation, or always require the reply-from-that-address step?
   Proposed: always require it; the LLM's `explains_mismatch` is recorded but
   never authorises a verification.

## References

- [`auto_verify_email.py`](../../zerotohero-python-server/auto_verify_email.py)
- [`test_auto_verify_email.py`](../../zerotohero-python-server/test_auto_verify_email.py)
- [SPEC-039 § M5](../specs/039-full-database-migration-supabase.md) — support pipe migrated to GoTrue
- [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md) — GoTrue admin API through Flask
- [ARCH-003](../arch/003-python-backend-architecture.md) — backend layout (currently stale for the removed `/verification_email` routes)
- [ARCH-029 § 3](../arch/029-production-deployment-runbook.md) — DreamHost VPS deploy and verify
- `zerotohero-nuxt/pages/verify-email.vue:42` — the pre-composed support mailto
