import { describe, it, expect } from 'vitest';
import {
  classifySubscriptionResponse,
  parseSubscriptionBody,
} from './subscription-check';

const LIFETIME = { id: 1, type: 'lifetime', expires_on: null };

describe('classifySubscriptionResponse (SPEC-053)', () => {
  it('treats a subscription record as authoritative Pro', () => {
    expect(classifySubscriptionResponse(200, LIFETIME)).toEqual({
      kind: 'sub',
      sub: LIFETIME,
    });
  });

  it('treats an explicit null subscription as authoritative free', () => {
    expect(classifySubscriptionResponse(200, { subscription: null })).toEqual({ kind: 'none' });
  });

  it('fails on a network error instead of reporting free', () => {
    // status 0 = the fetch threw (offline, Offline Mode, DNS/TLS).
    expect(classifySubscriptionResponse(0, null)).toEqual({ kind: 'failed', reason: 'network' });
  });

  it('fails on every non-2xx status, including auth and server errors', () => {
    for (const status of [302, 401, 403, 404, 500, 503]) {
      expect(classifySubscriptionResponse(status, LIFETIME)).toEqual({
        kind: 'failed',
        reason: `http-${status}`,
      });
    }
  });
});

describe('parseSubscriptionBody (SPEC-053)', () => {
  it('accepts a top-level record', () => {
    expect(parseSubscriptionBody({ id: 7, type: 'annual', expires_on: '2027-01-01 00:00:00' }))
      .toEqual({ kind: 'sub', sub: { id: 7, type: 'annual', expires_on: '2027-01-01 00:00:00' } });
  });

  it('accepts a record nested under `subscription`', () => {
    expect(parseSubscriptionBody({ subscription: LIFETIME }))
      .toEqual({ kind: 'sub', sub: LIFETIME });
  });

  it('never reads an empty or partial body as a subscription', () => {
    for (const body of [{}, null, undefined, '', 'free', 0, [], { id: null }, { id: 0 }]) {
      expect(parseSubscriptionBody(body)).toEqual({
        kind: 'failed',
        reason: 'unrecognized-body',
      });
    }
  });

  it('does not treat a malformed nested value as free or Pro', () => {
    expect(parseSubscriptionBody({ subscription: 'none' })).toEqual({
      kind: 'failed',
      reason: 'unrecognized-body',
    });
    expect(parseSubscriptionBody({ subscription: [] })).toEqual({
      kind: 'failed',
      reason: 'unrecognized-body',
    });
  });
});
