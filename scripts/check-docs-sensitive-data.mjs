#!/usr/bin/env node
/**
 * Fail when public docs contain real personal data or credentials.
 *
 * `docs/` is published on GitHub. This check scans the tracked markdown/HTML
 * docs for the classes of data that must never appear there:
 *
 *   - email addresses outside the project's own domains and reserved
 *     example domains (`example.com`, `.example`), unless explicitly allowed
 *   - real device identifiers (Apple UDIDs) and unknown UUIDs
 *   - API keys, webhook secrets, tokens, JWTs, private keys
 *   - a login email paired with a password literal (credential tables)
 *
 * Usage:  node scripts/check-docs-sensitive-data.mjs [--quiet]
 * Exit:   0 clean, 1 findings.
 *
 * When a finding is a false positive, add an explicit, commented allowlist
 * entry below — never loosen a pattern to make a report go quiet.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const QUIET = process.argv.includes('--quiet');

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const DEVICE_ID_RE = /\b0000[89][0-9a-f]{2,4}-[0-9a-f]{8,20}\b/gi;

// Project-owned and reserved domains. `zerotohero.ca` / `chinesezerotohero.com`
// are the company's own addresses (contact, role mailboxes, test accounts).
// `gserviceaccount.com` is a service-account identity, not a secret.
const EMAIL_DOMAIN_ALLOW = [
  /@zerotohero\.ca$/i,
  /@chinesezerotohero\.com$/i,
  /@[a-z0-9.-]*gserviceaccount\.com$/i,
  /@example\.(com|org|net)$/i,
  /@[a-z0-9.-]*\.example$/i,
];

// Exact addresses that are intentionally documented. Add a comment for each:
// an entry here is a decision, not a default.
const EMAIL_EXACT_ALLOW = new Set([
  // The owner's own Google account, which is the Play Console tester identity
  // (SPEC-067/068/074). It is the publisher's contact account, not a customer's.
  'longjiang2005@gmail.com',
  'longjiang2005+googleplaytester@gmail.com',
  // Documentation placeholders that are not valid inboxes.
  'you+lpiap@gmail.com',
  'you@you.com',
  // The DreamHost account on our own textbook-media host. A username, not a
  // credential; it appears in the rsync/ssh commands in ADR-0043 and SPEC-095.
  'dh_5rvnrz@server.chinesezerotohero.com',
]);

// UUIDs that are public identifiers or ephemeral local ids, not user data.
const UUID_ALLOW = new Set([
  // Netlify site ids (ARCH-029, SPEC-108) — not credentials; the API needs a token.
  '796f983a-ac9c-42e4-a066-5605d8b73e5c',
  '5b05fa26-63d1-4105-a9a6-1bab15408fb8',
  // Chrome Web Store publisher id (ARCH-029, SPEC-074) — publicly displayed.
  '650ad6b1-a9d4-43b6-9ff5-a8ae11ada6ad',
  // Ephemeral terminal ids from a debugging session (ARCH-012).
  '53300260-918d-4181-a6c4-f57df7ea3788',
  '5e37c2b0-1b9c-4706-bf9d-d89d5f654adb',
]);

const SECRET_PATTERNS = [
  [/sk_(?:live|test)_[A-Za-z0-9]{8,}/, 'Stripe secret key'],
  [/whsec_[A-Za-z0-9]{8,}/, 'Stripe webhook secret'],
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/, 'Google OAuth token'],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, 'SendGrid key'],
];

// A docs table row that pairs a login email with a password after a slash,
// e.g. "| Mary | `user@host` / `s3cretValue` |". Placeholders are excluded below.
const CREDENTIAL_ROW_RE = /^\s*\|.*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}.*\/\s*[`"'*_]{0,2}[A-Za-z0-9!@#$%^&*_-]{8,}\s*[`"'*_]{0,2}\s*\|/;
const PASSWORD_ASSIGN_RE = /\b(?:password|passwd|pwd|secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*[`"']?([^\s`"',;]{8,})/gi;
// A password written as a bare backticked token in prose, near a credential
// hint ("password", "test credentials", a test-account address). This is the
// shape that let one password survive the first sweep:
//   - Log in with the test credentials (Mary: `tester.mary@…` /
//     `REDACTED_TEST_PASSWORD`)
const BACKTICK_TOKEN_RE = /`([A-Za-z0-9!@#$%^&*_-]{10,40})`/g;
const CREDENTIAL_HINT_RE = /password|passphrase|credential|\blog in\b|tester\.(?:mary|bob)@/i;
// Tokens that are obviously not passwords.
const NOT_A_PASSWORD_RES = [
  /^[0-9a-f]{7,40}$/i, // commit/artifact hash
  /^[A-Z][A-Z0-9_]{2,}$/, // ENV_VAR names (case-sensitive on purpose)
  /^[a-z0-9.-]+\.[a-z]{2,}.*$/i, // domain or path
  /^https?:/i,
];

const PLACEHOLDER_RE = /^(?:<|\$\{|\.\.\.|…|x{3,}|your|change-me|redacted|omitted)/i;
// "password: appleid.apple.com" is prose about where to create an app-specific
// password, not a value. Skip hostnames/URLs.
const HOSTNAME_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i;

const files = execFileSync(
  'git',
  ['ls-files', '-z', 'docs', 'AGENTS.md', 'README.md', 'ROADMAP.md', 'packages/docs/content'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .filter((f) => /\.(md|html)$/i.test(f));

const findings = [];
const add = (file, line, rule, value) => findings.push({ file, line, rule, value });

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = i + 1;
    const prevLine = i > 0 ? lines[i - 1] : '';

    for (const m of raw.matchAll(EMAIL_RE)) {
      const address = m[0];
      if (EMAIL_EXACT_ALLOW.has(address.toLowerCase())) continue;
      if (EMAIL_DOMAIN_ALLOW.some((re) => re.test(address))) continue;
      add(file, line, 'real email address', address);
    }

    for (const m of raw.matchAll(UUID_RE)) {
      if (UUID_ALLOW.has(m[0].toLowerCase())) continue;
      add(file, line, 'UUID (possible user or device id)', m[0]);
    }

    for (const m of raw.matchAll(DEVICE_ID_RE)) {
      add(file, line, 'Apple device UDID', m[0]);
    }

    for (const [re, name] of SECRET_PATTERNS) {
      const m = raw.match(re);
      if (m) add(file, line, name, m[0]);
    }

    if (CREDENTIAL_ROW_RE.test(raw)) {
      add(file, line, 'email + password in one table row', raw.trim().slice(0, 100));
    }

    for (const m of raw.matchAll(PASSWORD_ASSIGN_RE)) {
      if (PLACEHOLDER_RE.test(m[1]) || HOSTNAME_RE.test(m[1])) continue;
      add(file, line, 'password-like assignment', m[0].slice(0, 100));
    }

    // Password-looking backticked token next to a credential hint.
    const context = `${prevLine}\n${raw}`;
    if (CREDENTIAL_HINT_RE.test(context)) {
      for (const m of raw.matchAll(BACKTICK_TOKEN_RE)) {
        const token = m[1];
        if (NOT_A_PASSWORD_RES.some((re) => re.test(token)) || PLACEHOLDER_RE.test(token)) continue;
        const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(token)).length;
        // Random-looking: lower + upper + digit, and not a code identifier.
        if (classes < 3 || token.length < 12 || token.includes('*')) continue;
        add(file, line, 'password-like literal', token);
      }
    }
  });
}

const unique = [...new Map(findings.map((f) => [`${f.file}:${f.line}:${f.value}`, f])).values()];
findings.length = 0;
findings.push(...unique);

if (!QUIET) {
  console.log(`Scanned ${files.length} tracked doc files.`);
}

if (findings.length === 0) {
  if (!QUIET) console.log('✅ No sensitive data found.');
  process.exit(0);
}

console.error(`\n❌ ${findings.length} finding(s):\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.value}`);
}
console.error(
  '\nDocs are public. Replace real data with synthetic values ' +
    '(`user@example.com`, `student@university.example`, `<uuid>`), move ' +
    'credential values into a gitignored env file, or add a commented allowlist\n' +
    'entry in scripts/check-docs-sensitive-data.mjs.\n',
);
process.exit(1);
