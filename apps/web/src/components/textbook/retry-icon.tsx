'use client';

import React from 'react';

/** The circular-arrow glyph shared by the retry affordances. */
export function RetryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M6 2.2V0.6L2.8 3l3.2 2.4V3.8a3 3 0 1 1-3 3.4H1.8A4.2 4.2 0 1 0 6 2.2z"
        fill="currentColor"
      />
    </svg>
  );
}
