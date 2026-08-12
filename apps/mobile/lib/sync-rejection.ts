/**
 * Expected, non-retryable sync rejections (SPEC-066 Phase 5).
 *
 * The backend rejects a rating with `srs_cap_reached` when a free user's
 * UTC-day budget is exhausted. The client already blocks ratings at the cap,
 * so this only fires as a multi-device/offline safety net. Treat it as an
 * acknowledged outcome: drop the outbox op and let the review UI show the
 * upgrade banner instead of a permanent sync-screen error.
 */
export function isExpectedSyncRejection(error: string | undefined): boolean {
  return !!error && error.includes('srs_cap_reached');
}
