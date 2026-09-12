import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAppToHostMessage,
  MOCK_APP_PROTOCOL_VERSION,
  mockAppHref,
  protocolCompatible,
} from './mock-app';

const RUNTIME_PATH = join(
  __dirname,
  '../../../apps/web/public/mock-apps/runtime.v1.js',
);

describe('isAppToHostMessage', () => {
  const valid = {
    ready: { v: 1, type: 'ready', payload: { app: 'railway-12306', version: '1', goals: [] } },
    tokenize: { v: 1, type: 'tokenize', payload: { texts: ['北京'] } },
    lookup: {
      v: 1,
      type: 'lookup',
      payload: { text: '北京', rect: { x: 1, y: 2, width: 3, height: 4 } },
    },
    progress: { v: 1, type: 'progress', payload: { done: ['a'], total: 2 } },
    complete: { v: 1, type: 'complete', payload: { goalId: 'a', answer: 'G49' } },
    resize: { v: 1, type: 'resize', payload: { height: 300 } },
  };

  it('accepts every contract message', () => {
    for (const message of Object.values(valid)) {
      expect(isAppToHostMessage(message)).toBe(true);
    }
  });

  it('rejects non-objects and unknown types', () => {
    expect(isAppToHostMessage(null)).toBe(false);
    expect(isAppToHostMessage('ready')).toBe(false);
    expect(isAppToHostMessage({ v: 1, type: 'launch-missiles', payload: {} })).toBe(false);
  });

  it('rejects a missing or wrongly typed payload field', () => {
    // Everything crossing a sandbox boundary is untrusted, so each field the
    // host acts on is checked rather than destructured optimistically.
    expect(isAppToHostMessage({ v: 1, type: 'resize', payload: { height: '300' } })).toBe(false);
    expect(isAppToHostMessage({ v: 1, type: 'lookup', payload: { text: '北京' } })).toBe(false);
    expect(isAppToHostMessage({ v: 1, type: 'complete', payload: { goalId: 'a' } })).toBe(false);
    expect(isAppToHostMessage({ v: 1, type: 'ready', payload: { app: 'x' } })).toBe(false);
    expect(isAppToHostMessage({ v: 1, type: 'ready' })).toBe(false);
  });

  it('requires a numeric version', () => {
    expect(isAppToHostMessage({ type: 'resize', payload: { height: 1 } })).toBe(false);
    expect(isAppToHostMessage({ v: '1', type: 'resize', payload: { height: 1 } })).toBe(false);
  });
});

describe('protocolCompatible', () => {
  it('accepts the current major and rejects others', () => {
    expect(protocolCompatible(MOCK_APP_PROTOCOL_VERSION)).toBe(true);
    expect(protocolCompatible(MOCK_APP_PROTOCOL_VERSION + 1)).toBe(false);
    expect(protocolCompatible(0)).toBe(false);
  });
});

describe('mockAppHref', () => {
  it('joins a base and an app id', () => {
    expect(mockAppHref('/mock-apps', 'railway-12306')).toBe('/mock-apps/railway-12306/index.html');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(mockAppHref('https://x.test/mock-apps/', 'a')).toBe(
      'https://x.test/mock-apps/a/index.html',
    );
  });

  it('encodes an app id that is not path-safe', () => {
    expect(mockAppHref('/m', 'a b')).toBe('/m/a%20b/index.html');
  });
});

describe('the runtime script', () => {
  const source = readFileSync(RUNTIME_PATH, 'utf8');

  // The runtime and this contract are two implementations of one protocol, and
  // nothing else would catch them drifting apart.
  it('declares the same protocol version as the contract', () => {
    const match = source.match(/var VERSION = (\d+);/);
    expect(match, 'runtime must declare a VERSION').toBeTruthy();
    expect(Number(match![1])).toBe(MOCK_APP_PROTOCOL_VERSION);
  });

  it('handles every host-to-app message type', () => {
    for (const type of ['init', 'help-mode', 'tokens', 'hint', 'reset']) {
      expect(source, `runtime must handle "${type}"`).toContain(`case '${type}':`);
    }
  });

  it('sends every app-to-host message type the contract defines', () => {
    for (const type of ['ready', 'tokenize', 'lookup', 'progress', 'complete', 'resize']) {
      expect(source, `runtime must be able to send "${type}"`).toContain(`type: '${type}'`);
    }
  });

  it('exposes the documented per-app surface', () => {
    expect(source).toContain('window.MockApp = MockApp');
    expect(source).toContain('define:');
    expect(source).toContain('complete:');
  });

  it('does not autoplay or fetch anything', () => {
    // The app runs sandboxed on an opaque origin, so a fetch would fail anyway —
    // and tokens are pushed in over the bridge rather than pulled.
    expect(source).not.toContain('fetch(');
  });
});
