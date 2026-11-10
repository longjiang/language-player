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

## Published history — the part git cannot fix

Items 1–5 were already on `origin/master`, so removing them from the tip does
**not** unpublish them: GitHub still serves the old commits. Treat them as
disclosed:

1. **Rotate the `tester.mary` / `tester.bob` passwords now.** They were public
   while valid; changing the docs does not invalidate them. Rotate through the
   GoTrue admin API and update `.env.e2e` only.
2. **Decide on history.** Removing the addresses and UDIDs from history needs a
   rewrite plus a force-push — destructive and outside this repo's "never push"
   rule, so it needs an explicit decision. For a customer address already
   public for weeks, rotation of anything sensitive is the higher-value action.
3. Device UDIDs cannot be rotated; their exposure is low (they identify a
   device, not an account), and the placeholders remain usable.

## Repeating the audit

```bash
node scripts/check-docs-sensitive-data.mjs          # exit 1 on findings
```

Add false positives to the commented allowlist in that script — never loosen a
pattern. The rule itself lives in `AGENTS.md` § "When You Make Changes".
