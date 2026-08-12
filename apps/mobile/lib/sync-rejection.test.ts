import { describe, it, expect } from 'vitest';
import { isExpectedSyncRejection } from './sync-rejection';

describe('sync-rejection (SPEC-066 free cap)', () => {
  it('recognizes the backend cap rejection', () => {
    expect(isExpectedSyncRejection('free SRS daily review cap reached (srs_cap_reached)')).toBe(true);
    expect(isExpectedSyncRejection('srs_cap_reached')).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isExpectedSyncRejection('network error')).toBe(false);
    expect(isExpectedSyncRejection(undefined)).toBe(false);
  });
});
