# Sensitive-data audit — public docs

**Date**: 2026-11-11
**Scope**: every tracked documentation file that ships with the repository
**Result**: current tip clean; 19 pre-existing findings; 1 action required outside git (rotate credentials)

## Scope and method

243 tracked `.md` / `.html` files were scanned: `docs/**`, `AGENTS.md`,
`README.md`, `ROADMAP.md`, and `packages/docs/content/**` (the user-facing docs
that get inlined into the apps). The scan looked for:

| Class | Pattern |
|---|---|
| Personal email | any address outside `zerotohero.ca`, `chinesezerotohero.com`, `*.gserviceaccount.com`, and the reserved `example.com` / `.example` domains |
| User / device ids | UUIDs not on the public-id allowlist; Apple hardware UDIDs (`00008xxx-…`) |
| Credentials | Stripe/AWS/GitHub/Slack/SendGrid/Google key formats, JWTs, private keys |
| Password literals | `password: value` assignments, and a docs table row pairing a login email with a password |

Every distinct hit was then read in context before being classified. The scan is
now repeatable: `node scripts/check-docs-sensitive-data.mjs` (exits 1 on
findings). Run against the pre-fix tip it reports **19 findings**; against the
current tree it reports none. The check's first version missed a password
written as a bare backticked token in prose (ARCH-028), so a password-literal
rule was added — the miss is why the check, not a generous allowlist, is the
durable part of this audit.

## Findings

| # | Finding | Where | Severity | Resolution |
|---|---|---|---|---|
| 1 | Two **live** test-account passwords (Mary, Bob) in a table, plus one repeated in prose | `AGENTS.md` (table), `docs/arch/028-…` (prose) | **High** | Removed; values moved to the gitignored `.env.e2e` (`E2E_MARY_PASS`, `E2E_BOB_PASS`). Both accounts are confirmed and active on production |
| 2 | A real MailerLite subscriber address, named in a migration note | `docs/specs/039-…` | **High** | Replaced with "one pre-cutover address … address omitted" |
| 3 | A real customer address in the MailerLite audit snapshot | `docs/arch/022-…` | **High** | Replaced with the purchase date and shape (separate commit) |
| 4 | Two Apple device UDIDs and a `devicectl` CoreDevice id | `docs/arch/028-…` (9), `docs/specs/064-…` | Medium | Replaced with `<ipad-udid>` / `<iphone-udid>` / `<ipad-devicectl-id>`; the runbook already documents how to read them |
| 5 | Real user handles (QQ ids, usernames) in the R6 results table | `docs/specs/043-…` | Medium | Anonymised to `user A`–`user E` (separate commit); the signal counts are unchanged |
| 6 | A Stripe **test** customer id | `docs/specs/054-…` | Low | Removed |
| 7 | The owner's own Google account, used as the Play Console tester | `docs/specs/067`, `068`, `074`, `054` | Low | Kept; explicit allowlist entry with rationale — it is the publisher's contact identity, not a customer's |
| 8 | DreamHost account name on our own textbook-media host | `docs/adr/0043-…`, `docs/specs/095-…` | Low | Kept; a username in an rsync/ssh command, not a credential |
| 9 | Netlify site ids and the Chrome Web Store publisher id | `docs/arch/029-…`, `docs/specs/074`, `108` | Info | Kept; public identifiers, useless without a token |
| 10 | LAN addresses (`192.168.x`), emulator/DNS addresses | `docs/arch/028`, `docs/adr/0046` | Info | Kept; no production host is identified by IP |

## Clean

No Stripe, MailerLite, Supabase, PayPal, Apple, Google, GitHub, Slack, or
SendGrid key material appears in any doc. No JWTs, private keys, service-account
JSON, or database passwords. The `sk_test_…` / `whsec_…` mentions are ellipsis
placeholders; the 64-hex strings in `docs/versioning/build-ledger.md` are
artifact hashes.

## Published history — remediated 2026-11-11

Items 1–5 were already on `origin/master` at the time of the audit, so editing
the tip did not unpublish them. Both remediation steps have now been taken:

1. **Credentials rotated.** `tester.mary` and `tester.bob` passwords were set to
   new values through the GoTrue admin API and the new values verified by a
   login (then logged out). The old values are dead; `.env.e2e` holds the
   current ones.
2. **History rewritten and force-pushed.** All refs were rewritten with
   `git filter-repo --replace-text` (old `master` tip `c5bfa9c6`, new tip after
   the rewrite), then `master` and the five remote feature branches were
   force-pushed to their rewritten commits. A complete pre-rewrite backup
   bundle was verified before the rewrite.

Residual risk to understand:

- GitHub may keep the old, now-unreachable commits addressable **by SHA** for a
  while (and any clone or fork made before the rewrite still has them). The
  repository has no forks today. If the bytes must disappear from GitHub
  entirely, GitHub Support has to expire the cached objects; a force-push alone
  does not.
- Device UDIDs cannot be rotated; their exposure is low (they identify a
  device, not an account), and the placeholders remain usable.
- Anyone with an old clone should re-clone rather than merge.

## Repeating the audit

```bash
node scripts/check-docs-sensitive-data.mjs          # exit 1 on findings
```

Add false positives to the commented allowlist in that script — never loosen a
pattern. The rule itself lives in `AGENTS.md` § "When You Make Changes".
