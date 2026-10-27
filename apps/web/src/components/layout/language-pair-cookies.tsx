'use client';

import { useEffect } from 'react';

const MAX_AGE = 60 * 60 * 24 * 365;

/** Read one cookie value from `document.cookie`. */
function readCookie(name: string): string | undefined {
  const row = document.cookie.split('; ').find((r) => r.startsWith(`${name}=`));
  return row?.slice(name.length + 1);
}

function writeCookie(name: string, value: string) {
  if (readCookie(name) === value) return;
  document.cookie = `${name}=${value}; path=/; max-age=${MAX_AGE}`;
}

/**
 * Remember the language pair on the **client**, so page responses carry no
 * `Set-Cookie` at all.
 *
 * `l1`/`l2`/`NEXT_LOCALE` used to be stamped on every `[l1]/[l2]` response by
 * the middleware. A shared cache will not store a response that sets a cookie —
 * one stored copy would hand the same cookie to every visitor — so those three
 * headers were the difference between a cacheable shell and one function
 * invocation per request (SPEC-108 Phase 2 step 7, Q4).
 *
 * Nothing reads these cookies during a render any more: the pair comes from the
 * URL, and `NEXT_LOCALE` only feeds the public routes and the `/` redirect. So
 * writing them after hydration is equivalent, just a moment later.
 */
export function LanguagePairCookies({ l1, l2 }: { l1: string; l2: string }) {
  useEffect(() => {
    writeCookie('l1', l1);
    writeCookie('l2', l2);
    writeCookie('NEXT_LOCALE', l1);
  }, [l1, l2]);

  return null;
}
