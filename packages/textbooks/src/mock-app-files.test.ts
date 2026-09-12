import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { allTasks } from './loaders';
import { tbltHsk4 } from './content/tblt-hsk4/book';
import { MOCK_APP_PROTOCOL_VERSION, protocolCompatible } from './mock-app';

/**
 * Checks a mock app's own file, not just the content that references it.
 *
 * `validateBook` is pure TS and cannot see the filesystem, so these four rules — which
 * the spec has always listed and never enforced — live here instead. Each catches drift
 * the content model cannot express: a renamed app directory, a goal the app no longer
 * has, a frame it cannot talk to, or a third-party script nobody vetted.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const MOCK_APPS_DIR = join(REPO_ROOT, 'apps', 'web', 'public', 'mock-apps');

/**
 * Remote scripts and stylesheets a mock app may load.
 *
 * ADR-0045 permits them, but each one is a supply-chain surface and an origin the frame's
 * CSP has to allow, so they must be pinned and listed here rather than appearing in an
 * app unchecked. Vendoring beats allowlisting when an app needs one.
 */
const ALLOWED_LIBRARY_HOSTS = new Set<string>([]);

/**
 * The goal ids an app declares, read out of its `goals: [...]` array.
 *
 * Bracket-matched rather than line-matched: goal objects contain nested arrow functions,
 * so indentation is not a stable signal — which is exactly how the first version of this
 * check passed on an empty list.
 */
function goalIds(html: string): string[] {
  const start = html.indexOf('goals:');
  if (start === -1) return [];
  const open = html.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        const body = html.slice(open, i);
        return [...body.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]!);
      }
    }
  }
  return [];
}

/**
 * Run an app's inline script and read what it hands to `MockApp.define`.
 *
 * The frame cannot execute an app's JS, but a test can: the scripts are DOM-free at the
 * top level (everything that touches `document` is inside a function that only runs on
 * mount), so a stub is enough. This is what makes the app's own declared answers
 * comparable to the content.
 */
function readDefine(html: string): { id?: string; expected?: Record<string, string> } {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) return {};
  let captured: { id?: string; expected?: Record<string, string> } = {};
  const sandbox = {
    MockApp: {
      define(spec: { id?: string; expected?: Record<string, string> }) {
        captured = spec;
      },
    },
    document: {},
    window: {},
    console,
  };
  runInContext(script[1]!, createContext(sandbox));
  return captured;
}

const mockAppTasks = allTasks(tbltHsk4).flatMap((task) =>
  task.body
    .filter((s): s is Extract<typeof s, { kind: 'mockApp' }> => s.kind === 'mockApp')
    .map((stimulus) => ({ task, stimulus })),
);

describe('mock app files', () => {
  it('has at least one mock app to check', () => {
    expect(mockAppTasks.length).toBeGreaterThan(0);
  });

  for (const { task, stimulus } of mockAppTasks) {
    describe(`${stimulus.app} (${task.id})`, () => {
      const dir = join(MOCK_APPS_DIR, stimulus.app);
      const file = join(dir, 'index.html');
      const html = existsSync(file) ? readFileSync(file, 'utf8') : '';

      it('exists at the path the frame requests', () => {
        expect(existsSync(file), `missing ${file}`).toBe(true);
      });

      it('declares the id the content references', () => {
        expect(html).toMatch(new RegExp(`id:\\s*'${stimulus.app}'`));
      });

      it('loads a runtime whose major version the frame speaks', () => {
        const match = html.match(/runtime\.v(\d+)\.js/);
        expect(match, 'no runtime script tag').toBeTruthy();
        expect(protocolCompatible(Number(match![1]))).toBe(true);
      });

      it('loads no library that is not on the allowlist', () => {
        const tags = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)].map(
          (m) => m[1]!,
        );
        const remote = tags.filter((href) => /^https?:\/\//.test(href));
        for (const href of remote) {
          const host = new URL(href).host;
          expect(
            ALLOWED_LIBRARY_HOSTS.has(host),
            `"${href}" is loaded from ${host}, which is not allowlisted`,
          ).toBe(true);
        }
      });

      it("parses this app's goal ids (positive control)", () => {
        // The first version of the check below matched nothing and passed; this fails if
        // the parse ever degrades to an empty list again.
        expect(goalIds(html).length).toBe(stimulus.goals.length);
      });

      it('declares answers the content agrees with', () => {
        const defined = readDefine(html);
        expect(defined.id, 'the script never called MockApp.define with an id').toBe(stimulus.app);
        const expected = defined.expected;
        if (!expected) return;
        const asSet = (value: string) =>
          value
            .split(/[、,，]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .sort()
            .join('|');
        for (const goal of stimulus.goals) {
          const blank = task.blanks?.[goal.blankId];
          if (!blank) continue;
          const declared = expected[goal.id];
          expect(declared, `the app declares no answer for goal "${goal.id}"`).toBeTruthy();
          expect(
            asSet(declared!),
            `goal "${goal.id}": app says ${declared}, content says ${blank.answer}`,
          ).toBe(asSet(blank.answer));
        }
      });

      it('declares exactly the goals the content links to', () => {
        // Both directions: a goal with no blank cannot be graded, and a blank with no
        // goal never completes.
        const linked = stimulus.goals.map((g) => g.id).sort();
        expect(goalIds(html).sort()).toEqual(linked);
      });
    });
  }
});
