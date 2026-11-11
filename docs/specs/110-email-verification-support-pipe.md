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

### Phase A deployed (2026-11-11)

| Check | Result |
|---|---|
| `auto_verify_email.sh` in the checkout, `~/.forward.postfix` repointed | wrapper runs the venv interpreter; old line backed up as `.forward.postfix.bak-2026-11-11` |
| `./auto_verify_email.sh --selfcheck` on production | `config`, `database`, `gotrue`, `state_dir`, `sendmail` — all ok |
| Pipe smoke test (`Subject: Hello`) | exit 0, logs "Ignoring email…", no mail sent, stderr empty |
| `support@` sender | `sendmail -f support@zerotohero.ca` accepted; test messages delivered |
| **sendmail inside the pipe** | Postfix exports `MAIL_CONFIG=/etc/postfix` (and `SENDER`, `RECIPIENT`, `CLIENT_*`, `LOCAL`, `DOMAIN`) into the pipe. Inherited, sendmail used the system queue, could not write `maildrop`, and **blocked forever** — two forwards hung and sent nothing. `send_mail` now strips those variables, passes `-f support@`, times out at 30 s, and logs a non-zero exit. Verified: 0.0 s per send |
| Full reply path | synthetic forward → "could not verify" reply from `support@`, no failure line, no hang |
| Log rotation | 10 MiB in-script, previous file kept as `.1` |

The first real forward (11 Nov, 09:18 JST) confirmed the legacy defect end to
end: it extracted the quoted Gmail sender instead of the requested school
address, so no verification happened and the address was never checked against
the account the user asked about. That is the failure Phase B fixes.

**Phase A restores execution, not correctness.** The address-extraction defect
above is unchanged until Phase B, so do **not** broaden the DreamHost filter
(§ 10.6) or trust auto-verification yet — the filter staying `Fwd`-only is
load-bearing while the legacy parser is live.

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

### Transport (DreamHost panel, confirmed 2026-11-11)

The mailbox's **Message Filters** screen confirms the panel side:

- `verify_email@zerotohero.ca` has a filter that forwards a copy of mail whose
  **subject contains `Fwd`** to shell account `dh_rqe96h` on `vps14733`.
- A preceding filter copies the same mail into a `Fwd` folder.
- `~/.forward.postfix` on `dh_rqe96h` pipes the raw message into the script.

So forwarding is live. But the `Fwd` gate is a transport bug with two effects
the earlier draft missed:

1. **Only subjects containing `Fwd` reach the pipe.** Outlook forwards as
   `FW:` and localized clients use prefixes such as `WG:` (de), `TR:` (fr/it),
   `转发:` (zh), `転送:` (ja), `전달:` (ko). Those messages stay in the mailbox
   and never reach the script, whatever § 1 accepts. Fix it in the filter, not
   the script: forward **all** mail addressed to `verify_email@` — the mailbox
   is dedicated to this pipe — and let the script's subject/intent checks
   decide.
2. **A reply to an automated message is `Re: …` and is therefore not piped.**
   If `Reply-To` becomes `verify_email@` so a retry needs no human, the filter
   must match `Email Verification Issue` as well, or (better) forward
   everything.

## Detection across locales (2026-11-11)

**Scope of "our languages".** `SUPPORTED_L1S` has **18** interface locales
(`en, zh-Hans, zh-Hant, ar, de, es, fr, id, it, ja, ko, nl, pl, pt, ru, th, tr,
vi`); `translations.csv` has **19 columns** because the first is the key. The
mail client's language and the message's language are independent of both, and
users may write in any of the 110 learning languages, so detection must not key
off our interface list.

One realistic forwarded sample was built per locale — localized forward marker,
localized quoted `From:` label, localized request prose, sending address
`sender@example.com`, requested address
`student@university.example` — and ran the current extractor, a prototype of
the deterministic path, and the DeepSeek prompt from § 2 against each.

| Locale | Quoted label / marker tested | Current extractor | LLM (§ 2 prompt) | Prototype (label table + punctuation strip) |
|---|---|---|---|---|
| en | `From:` / `---------- Forwarded message ---------` | quoted sender (wrong) | ✅ | ✅ |
| zh-Hans | `发件人:` / `下面是被转发的邮件：` | quoted sender (wrong) | ✅ | ✅ |
| zh-Hant | `寄件者:` / `轉寄郵件` | quoted sender (wrong) | ✅ | ✅ |
| ar | `من:` / `رسالة معاد توجيهها` (RTL) | quoted sender (wrong) | ✅ | ✅ |
| de | `Von:` / `Weitergeleitete Nachricht` | quoted sender (wrong) | ✅ | ✅ |
| es | `De:` / `Mensaje reenviado` | quoted sender (wrong) | ✅ | ✅ |
| fr | `De :` / `Message transféré` | quoted sender (wrong) | ✅ | ✅ |
| id | `Dari:` / `Pesan yang diteruskan` | quoted sender (wrong) | ✅ | ✅ |
| it | `Da:` / `Messaggio inoltrato` | quoted sender (wrong) | ✅ | ✅ |
| ja | `差出人:` / `転送されたメッセージ` | quoted sender (wrong) | ✅ | ✅ |
| ko | `보낸 사람:` / `전달된 메시지` | quoted sender (wrong) | ✅ | ✅ |
| nl | `Van:` / `Doorgestuurd bericht` | quoted sender (wrong) | ✅ | ✅ |
| pl | `Od:` / `Przekazana wiadomość` | quoted sender (wrong) | ✅ | ✅ |
| pt | `De:` / `Mensagem encaminhada` | quoted sender (wrong) | ✅ | ✅ |
| ru | `От:` / `Пересылаемое сообщение` | quoted sender (wrong) | ✅ | ✅ |
| th | `จาก:` / `ข้อความที่ส่งต่อ` | quoted sender (wrong) | ✅ | ✅ |
| tr | `Kimden:` / `İletilen ileti` | quoted sender (wrong) | ✅ | ✅ |
| vi | `Từ:` / `Chuyển tiếp tin nhắn` | quoted sender (wrong) | ✅ | ✅ |
| hi, sw (outside the 18) | `From:` / `Kutoka:` | n/a | ✅ | n/a |

Results: **18/18** locales returned the quoted sender under the current
extractor — the defect is locale-independent, which is why it was never caught.
The LLM returned `requester`, `requested`, and `intent=verify_email` correctly
in **18/18** (confidence 0.9–0.95, ~1 s per call), and also for Hindi and
Swahili, and for mixed cases where the client language differs from the message
language (Chinese body with German labels, Japanese body with French labels,
Arabic body with English labels).

**Three requirements this establishes:**

1. **Localized label and marker tables.** The deterministic path needs
   `FORWARD_MARKERS` and `FORWARD_LABELS` covering the 18 locales above (the
   table is data, not prose). A label we do not know must fall through to "no
   confident sender" → ask the user, never guess. The LLM path is what makes
   the pipe work for languages outside the table.
2. **Address normalization must strip sentence punctuation.** The first run of
   the prototype found the requested address in only **5/18** locales; the other
   13 failed solely because a trailing period was captured as part of the
   domain (`…university.example.`). Strip `. , ; : ) ] } >` plus full-width `。，；、！？`
   before validation and comparison, and require a dotted alphabetic TLD.
3. **Per-locale regression fixtures.** One sample per locale (plus a
   mixed-language case and an unknown-label case) belongs in the test suite;
   "works in English" is not evidence for the other 17.

## Goals

1. The pipe runs on every forwarded message, using the deployed virtualenv, and
   records what it did even when it fails.
2. Auto-verification happens **only** when the address to confirm is the same
   mailbox the request came from, including when the request arrives as a
   forward inside Jon's mailbox.
3. An LLM identifies the requester and the requested address; deterministic
   code — not the LLM — makes the security decision.
4. Every outcome notifies the requester via both addresses and Jon, in one
   thread that carries the requesters' previous messages — **except** an
   already-verified account, which notifies Jon only and is silent to the user.
5. When the rule cannot be satisfied, the pipe asks the requester to reply from
   the address they want verified, and escalates on the next failure instead of
   verifying.
6. An already-confirmed account is detected before anything else and reported to
   Jon with its confirmation date, account status, and subscription details.
7. Detection works for all 18 interface locales, and for a message whose
   language differs from the mail client's.

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
| D2 | One email per outcome: `To:` both addresses (deduped, omitted when identical), `Cc:` `jon.long@zerotohero.ca`. Two exceptions — NO_ACCOUNT does not mail an unregistered address, ALREADY_VERIFIED mails Jon only | Single thread, no duplicate copies, Jon always sees the exact message the user received |
| D3 | On a mismatch, do not verify: reply asking the requester to reply from the address they want verified, `Cc` Jon; on the next failed attempt, escalate to a human | Fail closed, and give the user a path that the pipe can complete automatically on retry |
| D4 | Every outbound mail quotes all previous requester messages in the thread and sets `In-Reply-To`/`References` | Jon and the user both see the whole history without searching; mail clients thread it correctly |
| D5 | Spec first; implementation follows approval | The LLM dependency, notification copy, and state store are user-visible choices |
| D6 | **Check `email_confirmed_at` first.** An already-verified account produces a single email to Jon (confirmation date, account status, subscription summary) and **nothing at all to the user** | The user's problem is then not verification; a second "you are verified" mail confuses them, and the account facts belong with Jon. Silence also removes an oracle for anyone probing which addresses are registered |
| D7 | Detection is required in all 18 interface locales, and must tolerate a client language that differs from the message language | § Detection across locales: the model is correct in 18/18, but only with the label table, punctuation normalization, and per-locale fixtures in place |

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
  3. already?      account exists and email_confirmed_at is set → email Jon only, stop
  4. match         requested == sender (case-insensitive, exact) → eligible
  5. decide        VERIFIED | MISMATCH_RETRY | ESCALATE |
                   NO_ACCOUNT | GOTRUE_ERROR | UNPARSEABLE | IGNORED
  6. act           GoTrue admin confirm + trial/MailerLite (only for VERIFIED)
  7. notify        one threaded email; recipients depend on the decision (ALREADY_VERIFIED is Jon-only)
  8. record        structured log line per stage + thread state update
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
- **Transport reality:** the DreamHost filter only delivers messages whose
  subject contains `Fwd` (see Transport above), so the direct-message branch is
  unreachable until that filter is broadened. The script keeps both branches —
  they are what will run once the filter forwards everything — but the
  deployment step must not assume direct mail is already arriving.
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

### 3. Already verified? (administrative short-circuit — silent to the user)

Before the match rule and before any verification, look up `requested` with
`usub._user_by_email`; if a row exists, read its status from the GoTrue admin
API (`GET /auth/v1/admin/users/<id>`) and check `email_confirmed_at`. If it is
set, there is nothing to verify and **the user must not hear from us at all**:

- **No immediate email.** Append the case to the Jon-only **daily digest**
  queue (§ 8); one digest per day is sent to `jon.long@zerotohero.ca` only.
  **No** `To`, `Cc`, or `Bcc` on any requester/requested address, and no copy
  of it in the thread that is later sent to the user.
- Digest entry subject line: `Already verified: <requested address>`.
- No GoTrue call, and no trial/MailerLite run (that hook ran when the account
  was first verified; re-running it is pointless).
- Thread status `already_verified`, `notified_user: false`.
- Short-circuit: return before the match rule, so even a mismatched requester
  gets silence rather than the "reply from `<requested>`" instruction.

The digest entry contains, in this order:

| Field | Source |
|---|---|
| Requested address, `auth.users.id` | `_user_by_email` |
| `email_confirmed_at` | GoTrue admin `GET /auth/v1/admin/users/<id>` |
| `created_at`, `last_sign_in_at` | same |
| **Last 5 sign-ins** | `public.user_login_events` (Related work), newest first. Until that table exists the entry prints `auth.users.last_sign_in_at` and `signin_history=unavailable`. **Do not enable Supabase's database audit-log storage for this** — it records every auth event, including hourly token refreshes (see Related work) |
| Role, banned state (`banned_until` or "active") | GoTrue admin |
| **Saved words**: total, per-language counts (top 5 + "other") | `public.user_saved_words` grouped by `l2` |
| **Learning languages**: each `l2`, level, total hours, last activity | `public.user_progress` (`level`, `time_ms`, `updated_at`) |
| Subscription summary — type, status, `expires_on`, `created_on`, payment processor — or "none" | `usub.get_subscriptions_by_owner(user_id)` |
| Whether the requester address equals the account owner, and `possible_probe=1` when it does not | `requested == requester` |
| Original subject, `Message-ID`, and the quoted thread | inbound message + thread store |

Why silent: a user who is already confirmed and still asks for help has a
different problem (password, wrong login provider, client cache). Telling them
"you are already verified" does not answer it and reads as a brush-off; Jon can
decide the next step with the account facts in front of him. Silence also
removes an oracle — a stranger probing whether an address is registered learns
nothing from the pipe.

Why before the match rule: the account is already in the state the user asked
for, so there is nothing to authorise, and asking a mismatched requester to
re-send from the address would be wrong when no verification will follow.

### 4. Deterministic fallback (no LLM)

- `requester_email` = quoted header-block sender (forwarded) or top-level `From`.
- Remove the quoted header block and everything after a reply-attribution line,
  then collect addresses from the remaining body.
- Exactly one address → that is `requested_verification_email`.
- Zero or more than one → **UNPARSEABLE** (never guess).
- The same match rule then applies. This is safe without an LLM: a match means
  the requester controls the mailbox, and a mismatch never verifies.

### 5. Match rule

```
normalize(a) = a.strip().strip("<>").lower()
eligible    = normalize(requested) == normalize(requester)
```

Exact equality only. No Gmail dot/plus normalisation: treating `a.b@x` as
`ab@x` or `a+tag@x` as `a@x` would let an alias confirm an address the
requester may not own, and the retry email makes the exact match achievable.
`requested` must also exist in `auth.users` (`_user_by_email`), otherwise
**NO_ACCOUNT**.

### 6. Decision table

| Condition | Decision | Verify? | Notify |
|---|---|---|---|
| Account exists and `email_confirmed_at` is set (**checked first**, § 3) | ALREADY_VERIFIED | no | **queued for the Jon-only daily digest — user silent** |
| LLM `intent=other` or no address identifiable | UNPARSEABLE | no | reply asking for the address, Cc Jon |
| `requested != requester`, first failure in this thread | MISMATCH_RETRY | no | reply: names both addresses, asks for a **spam-folder check**, and to reply from `<requested>` (§ Reply copy), To both, Cc Jon |
| `requested != requester`, second or later failure | ESCALATE | no | reply: human will follow up; internal case summary to Jon |
| Match, no `auth.users` row | NO_ACCOUNT | no | To requester + Jon (see § 7 note) |
| Match, GoTrue non-2xx / unreachable | GOTRUE_ERROR | no | To both, Cc Jon, with the HTTP status |
| Match, admin confirm 2xx | VERIFIED | yes | "verified, log in", To both, Cc Jon |
| LLM low confidence but exactly one body address **and** it equals `requester` | VERIFIED | yes | as above; `llm=low_conf` recorded |

Rows are evaluated top to bottom; ALREADY_VERIFIED short-circuits, so a
confirmed account never reaches the mismatch or verification rows. "First/second
failure" is tracked per thread in § 8. `VERIFIED` always runs the trial +
MailerLite hook; the hook is idempotent (it grants a trial only when the user
has no subscription) and its failures never change the outcome.

### 7. Notification matrix

| Field | Value |
|---|---|
| `From` | `Language Player Support <support@zerotohero.ca>` (all automated mail; SPF already includes DreamHost) |
| `Reply-To` | `support@zerotohero.ca` |
| `To` | requester address **and** requested address, deduplicated, omitted when equal — **except ALREADY_VERIFIED, which is the daily digest to `jon.long@zerotohero.ca` only** |
| `Cc` | `jon.long@zerotohero.ca` |
| `Subject` | `Re: <subject with repeated Re:/Fwd: prefixes collapsed>`; the ALREADY_VERIFIED digest uses `[support] Already verified — <N> case(s)` |
| `In-Reply-To` | latest inbound `Message-ID` (digest entry keeps the original as a quoted reference) |
| `References` | all inbound `Message-ID`s in the thread, in order |
| `Message-ID` | `<uuid@zerotohero.ca>` (generated, recorded) |
| Body | outcome paragraph, next step, then every stored requester message quoted (`> `) with `On <date>, <from> wrote:` |
| Headers | `Auto-Submitted: auto-replied` so mail loops stop |

Recipients per outcome:

| Outcome | `To` | `Cc` | User sees anything? |
|---|---|---|---|
| ALREADY_VERIFIED | `jon.long@zerotohero.ca` (daily digest) | — | **no** |
| VERIFIED / GOTRUE_ERROR / MISMATCH_RETRY / ESCALATE | requester + requested | Jon | yes |
| NO_ACCOUNT | requester | Jon | yes (requested address not mailed) |
| UNPARSEABLE | requester | Jon | yes |
| IGNORED | — | — | no |

**Two deliberate exceptions to "both addresses":**

1. **NO_ACCOUNT** — the requested address is not a registered account, so it is
   not mailed. Without that rule the pipe is an open relay that sends our
   branded mail to any address a stranger types into a body. The requester and
   Jon are still notified, and Jon's copy states that the requested address has
   no account.
2. **ALREADY_VERIFIED** — Jon only, nothing to the user (D6). This is a hard
   requirement: no `To`/`Cc`/`Bcc` on either user address, no "already
   verified" note, and no inclusion of the user in any later reply in that
   thread unless a new inbound message arrives that is not ALREADY_VERIFIED.

Delivery is best-effort per recipient: one failure is logged and does not stop
the other recipient or the GoTrue action.

**Reply path.** `Reply-To: support@` means a user replying to an automated
message lands in the support mailbox, and the mailbox filter only pipes
subjects containing `Fwd` — so that reply is not processed until the filter is
broadened (Transport, above). Until it is, the retry instruction still needs Jon
to forward. The deployment step (§ 10) must either broaden the filter or accept
that human hop.

### Reply copy (MISMATCH_RETRY)

The mismatch email goes to both addresses, so it must be short, neutral, and
readable by someone who is not looking at the original thread. It contains, in
this order:

1. The two addresses, named explicitly: "you wrote from `<requester>`" and
   "you asked us to verify `<requested>`".
2. One sentence: we only verify an address when the request comes from that
   address, because that is how we know it belongs to you.
3. **A spam-folder check.** "Also check your spam/junk folder (and the All Mail
   label, if you use Gmail): the verification email may have been filtered."
   This matters because the most common reason someone asks for help is that the
   email never arrived, not that the address is wrong.
4. The next step: reply to this message **from `<requested>`**.
5. A fallback: if it still does not arrive, reply and Jon will help directly.

Constraints:

- Never state whether `<requested>` has an account, is already verified, or has
  a subscription. The mismatch reply is the only copy sent to an address whose
  ownership we have not established, so it must not become a lookup oracle.
- No marketing, no login link, no account details in this email.
- Keep it to five short sentences; the thread quote is below it, not in place
  of it.

### 8. Thread state

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
  "status": "mismatch|verified|already_verified|escalated|no_account|error",
  "notified_user": true,
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
pruned on write, atomic replace (write temp + `os.replace`). `notified_user` is
`false` for ALREADY_VERIFIED and IGNORED, and is the record that the silence
requirement was honoured. The file is plain text containing user
correspondence — restrict permissions to `0600` and keep it out of the git
checkout (it lives in `$HOME`, not in `/home/dh_rqe96h/zerotohero-python`).

**What the thread state is for** (it is not a CRM; it exists so the pipe can be
stateless per message yet behave consistently):

1. **Attempt counting** — distinguishes the first mismatch (ask the user to
   reply from the address) from the second (escalate). Without it every
   mismatch would retry forever.
2. **History for quoting** — the automated replies must include every earlier
   message the requester sent, even though each run only receives one email.
3. **Rate limiting** — max 3 outbound mails per address per 24 h, so the pipe
   cannot be used as a mail amplifier.
4. **Idempotency** — if postfix redelivers the same `Message-ID`, the pipe sees
   it in `outbound` and does not send twice or verify twice.
5. **Digest queue** — ALREADY_VERIFIED entries accumulate here for the daily
   digest, and `notified_user: false` proves the silence rule held.

90 days is kept: it covers any realistic retry window, and the files contain
correspondence, so shorter is better than longer. A 24 h rate-limit window and
the digest are the only things that need days, not months.

### Digest queue

`$AUTO_VERIFY_STATE_DIR/already_verified.jsonl`, one JSON object per case
(`received_at`, `requested`, `requester`, `confirmed_at`, `possible_probe`,
report body). A DreamHost cron runs once a day at 09:00 local:

```
auto_verify_email.py --send-digest
```

which sends one email to `jon.long@zerotohero.ca` from `support@`, subject
`[support] Already verified — <N> case(s)`, body = every queued entry, then
truncates the queue. A run that finds an empty queue sends nothing. If sending
fails, the queue is left intact for the next day.

### 9. Logging

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

### 10. Deployment repair (do this first, independent of § 2–8)

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
6. **Broaden the DreamHost filter — Phase B prerequisite, not Phase A.** It
   currently matches `Subject contains Fwd`; change it to forward *all* mail to
   `verify_email@` to `dh_rqe96h` (panel: Mail → Message Filters). Do this only
   once the hardened parser ships: with the legacy parser live, a broadened
   filter would feed it `FW:`/localized forwards and replies it cannot parse
   safely. Without the change, those never reach the pipe (Transport, above).
7. Add the daily digest cron (`auto_verify_email.py --send-digest`, 09:00) and
   make sure `support@zerotohero.ca` exists and can send from the VPS
   (`sendmail -f support@zerotohero.ca` to your own address; SPF already
   includes DreamHost).
8. **Leave "Write audit logs to the database" OFF.** The dashboard's own note
   is accurate: Supabase keeps Auth logs outside the database either way, and
   the toggle only adds a permanent copy of *every* auth event to
   `auth.audit_log_entries` — including an hourly `token_refreshed` per live
   session. With 5,553 live sessions that is on the order of 10^5 rows/day, and
   it would become the largest table in an 8 GB database within weeks. Record
   logins in `user_login_events` instead (Related work).

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
- Only `auth.users` addresses receive the requested-address copy (§ 7).
- ALREADY_VERIFIED never emits mail to a user address, so probing whether an
  address is registered through the pipe reveals nothing.
- No credentials, tokens, or full message bodies in logs; state files `0600`.

## Tests

Unit (pytest, no network — extend `test_auto_verify_email.py`):

1. Per-locale forwarded fixtures — all **18** interface locales (localized
   forward marker, localized `From:` label, localized prose) return the correct
   `requester` and `requested`; plus a mixed case (Chinese body, German labels),
   a language outside the interface set (Hindi/Swahili), and an unknown label
   that must fall back rather than guess.
2. The real message (synthetic addresses) → `MISMATCH_RETRY`, GoTrue never called.
3. Direct message where `From == body address` → `VERIFIED`.
4. Direct message where they differ → `MISMATCH_RETRY`, then `ESCALATE` on the
   second attempt. The retry body names both addresses, asks the user to check
   their spam/junk folder, and never states whether the requested address has an
   account, is verified, or has a subscription.
5. LLM returns an address absent from the message → discarded → UNPARSEABLE.
6. LLM returns invalid JSON / times out → deterministic fallback, same
   decisions as 2–4.
7. Decision table coverage: NO_ACCOUNT, GOTRUE_ERROR.
8. ALREADY_VERIFIED: an account with `email_confirmed_at` set appends one entry
   to the digest queue and sends **no immediate mail** — nothing to either user
   address — with the confirmation date, account status, subscription summary,
   saved-word totals by language, and learning languages; GoTrue is not called
   and the trial/MailerLite hook does not run. The same holds when the requester
   is a different address (silence wins over the retry email).
9. Digest: `--send-digest` renders queued entries into one mail to
   `jon.long@` only, truncates the queue, sends nothing for an empty queue, and
   leaves the queue intact when sendmail fails.
10. Notification recipients: dedupe when addresses match, both when they differ,
    Jon always `Cc`, requested address skipped for NO_ACCOUNT, digest-only for
    ALREADY_VERIFIED; `From` is `support@zerotohero.ca` on every outcome.
11. Threading: `In-Reply-To`/`References` chain, quoted history contains every
    stored message, `0600` permissions.
12. Loop guards: `mailer-daemon`, `Auto-Submitted`, our own address.
13. Repeat delivery of the same `Message-ID` sends nothing and verifies nothing.
14. Self-check reports each failure mode.
15. Sign-in history: five `user_login_events` rows render newest-first; an
    empty table degrades to `last_sign_in_at` plus `signin_history=unavailable`
    instead of failing or printing noise.

Existing `confirm_user_and_enroll` tests stay green unchanged.

Dry run for replay: `AUTO_VERIFY_DRY_RUN=1` runs intake → decision → notification
composition, writes the would-be emails and the decision to a temp directory,
and never calls GoTrue or sendmail. Used to replay real messages in review.

## Acceptance criteria

1. `--selfcheck` passes on the production host; the pipe line uses the venv.
2. Forwarding the real message produces `MISMATCH_RETRY`, **does not**
   confirm any address, and notifies the requester at both addresses with Jon
   `Cc`'d.
3. The mismatch reply names both addresses, asks the requester to check their
   spam/junk folder, and discloses nothing about the requested account's state.
   Replying from `student@university.example` to that thread confirms the
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
8. Requesting verification for an already-confirmed address sends **no
   immediate mail**; the case appears once in the next daily digest with the
   confirmation date, account status, subscription summary (or "none"),
   saved-word totals by language, and learning languages. Neither the sender nor
   the requested address receives any mail, and no GoTrue write occurs.
9. The digest is sent once per day to Jon only, and an empty day sends nothing.
10. Every automated message has `From: support@zerotohero.ca` and
    `Reply-To: support@zerotohero.ca`.
11. All 18 locale fixtures pass, and an unknown-label message asks for the
    address instead of verifying.
12. Once `user_login_events` is populated, the digest lists the five most
    recent sign-ins; before it is, the digest still sends and says the history
    is unavailable.

## Rollout

| Phase | Work | Gate |
|---|---|---|
| A (P0) — **shipped 2026-11-11** | Wrapper script, `.forward.postfix`, `--selfcheck`, startup guard, log rotation, `support@` sender | Selfcheck 5/5 on production; ignored-message smoke test passes |
| B | Intake/forwarded detection (18-locale label + marker tables), LLM identify + cross-check, **already-verified short-circuit**, match rule, decision table, thread store, notification matrix | Tests in § Tests green; dry-run replays of 5 real messages reviewed |
| C | Docs: correct ARCH-003, record the as-built in this spec, add the Next.js contact-link gap to the roadmap | Review |

Phase A is independent: it can ship before any hardening and restores the
capability the user already believes is on.

## Resolved decisions (2026-11-11)

1. **DreamHost filter** — confirmed from the panel screenshots: it forwards
   subjects containing `Fwd` to `dh_rqe96h` on `vps14733`, and a preceding
   filter files the same mail into `Fwd`. Broadening it to forward all mail is
   deployment step § 10.6.
2. **NO_ACCOUNT** — the requested address is not mailed; the open-relay guard
   stands (§ 7).
3. **Sender** — every automated message uses
   `Language Player Support <support@zerotohero.ca>`, and every support address
   in the web, mobile, and Classic UIs now points there too. SPF for
   `zerotohero.ca` already includes DreamHost; § 10.7 verifies an actual send.
4. **Escalation** — always require the reply-from-the-requested-address step.
   `explains_mismatch` is recorded and never authorises a verification.
5. **ALREADY_VERIFIED contents** — the report adds the last 5 sign-ins, saved
   words by language, and learning languages with level/hours (§ 3).
6. **Digest** — already-verified notices batch into one daily email to Jon (§ 8).
7. **Sign-in history (revised 2026-11-11)** — **do not** enable database
   audit logging. Its volume is dominated by token refreshes, which is the
   wrong data for DAU/MAU and for "last five sign-ins". Record one row per
   login in `user_login_events` (Related work); the digest reads that and falls
   back to `last_sign_in_at` until it exists.
8. **Retention** — 90 days confirmed (§ 8), with older audit rows pruned to
   match.

## Open questions

None — every question raised on 2026-11-11 is answered above. Implementation
remains: Phase A deployment (§ 10), then the pipe hardening (§ 2–8).

## Related work (tracked here so it is not forgotten)

### Supabase transactional email sender

The pipe's own mail will come from `support@` (§ 7), but Supabase Auth still
sends **confirm-signup, magic-link, invite, recovery, email-change,
password-changed, reauthentication, and security-notification** emails from its
own SMTP sender — today the Supabase default, not a `zerotohero.ca` address.
Those are automated messages too, and the From line should match the address
every UI link now points at.

Tracked tasks:

1. Configure **custom SMTP** (Authentication → Emails → SMTP settings) with
   `Language Player <support@zerotohero.ca>` as the sender, using a dedicated
   DreamHost mailbox credential stored only in the Supabase dashboard — never in
   this repo.
2. Verify SPF/DKIM/DMARC alignment for that sender and send a test of each
   template. The reset-password "localhost" bug is already fixed (2026-08-05),
   but re-check the redirect after the SMTP change.
3. Update `docs/email-templates/*.html` if any template prints a contact
   address; none does today.
4. Acceptance: a real signup, magic-link, and password-reset email each show
   `support@zerotohero.ca` as the sender, pass authentication, and land in the
   inbox. Until then auth mail keeps the Supabase sender.

Changing SMTP affects every auth email, so do it in a quiet window and re-test
all flows.

### User login activity (DAU/MAU)

Supabase's **"Write audit logs to the database"** toggle is not the right tool
for activity analytics. The dashboard text is correct — Auth logs remain
available without it — but enabling it copies *every* auth event into
`auth.audit_log_entries`, and refreshes dominate: 5,553 live sessions and
21,501 refresh tokens today, with `token_refreshed` firing about hourly per
session. That is ~10^5 rows/day; at ~0.5–1 KB/row it is tens of GB per month,
against an 8 GB database.

What to build instead (tracked; not part of the pipe):

```sql
create table public.user_login_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  source      text,          -- 'password' | 'link-session'
  ip          text
);
create index on public.user_login_events (user_id, occurred_at desc);
create index on public.user_login_events (occurred_at);
```

- Write one row from Flask `/auth/login` and `/auth/session` (not on refresh).
  At today's scale that is a few hundred rows/day.
- Prune to 90 days with the same monthly job as the thread store.
- Queries: DAU `count(distinct user_id) where occurred_at::date = current_date`;
  MAU over 30 days; dormant users via `max(occurred_at)` or
  `auth.users.last_sign_in_at`.
- The pipe's digest reads the last five rows for the account, falling back to
  `last_sign_in_at` until the table is populated.
- **Leave the Supabase toggle off.** If per-event forensics is ever needed,
  turn it on temporarily and prune aggressively, knowing refreshes dominate.

## References

- [`auto_verify_email.py`](../../zerotohero-python-server/auto_verify_email.py)
- [`test_auto_verify_email.py`](../../zerotohero-python-server/test_auto_verify_email.py)
- [SPEC-039 § M5](../specs/039-full-database-migration-supabase.md) — support pipe migrated to GoTrue
- [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md) — GoTrue admin API through Flask
- [ARCH-003](../arch/003-python-backend-architecture.md) — backend layout (currently stale for the removed `/verification_email` routes)
- [ARCH-029 § 3](../arch/029-production-deployment-runbook.md) — DreamHost VPS deploy and verify
- `zerotohero-nuxt/pages/verify-email.vue:42` — the pre-composed support mailto
