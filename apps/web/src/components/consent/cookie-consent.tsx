'use client';

import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const CONSENT_COOKIE = 'lp_consent';
const AFF_COOKIE = 'lp_aff';
const MAX_AGE = 180 * 24 * 60 * 60;

type Consent = { v: 1; affiliate: boolean; analytics: boolean; ts: number };

function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`))
    ?.split('=')[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Consent;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeConsent(consent: Consent) {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax`;
}

function clearAffiliateCookie() {
  document.cookie = `${AFF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function CookieConsent() {
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [manage, setManage] = useState(false);
  const [affiliate, setAffiliate] = useState(false);
  const affcode = useMemo(() => searchParams.get('affcode')?.trim().toUpperCase() ?? '', [searchParams]);

  useEffect(() => {
    const existing = readConsent();
    setConsent(existing);
    setAffiliate(existing?.affiliate ?? false);
    setReady(true);
  }, []);

  async function setAffiliateConsent(value: boolean) {
    const next: Consent = {
      v: 1,
      affiliate: value,
      analytics: value,
      ts: Date.now(),
    };
    writeConsent(next);
    setConsent(next);
    setAffiliate(value);
    if (!value) {
      clearAffiliateCookie();
      await fetch('/api/affiliate/consent', { method: 'DELETE' }).catch(() => undefined);
    } else if (affcode) {
      await fetch('/api/affiliate/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: affcode }),
      }).catch(() => undefined);
    }
    log('[LP Web] cookie consent saved', { affiliate: value, pathname });
  }

  if (!ready || consent) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl text-sm">
          <p className="font-medium">{t('msg.cookie_title')}</p>
          <p className="mt-1 text-muted-foreground">{t('msg.cookie_body')}</p>
          {manage && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={affiliate}
                onChange={(e) => setAffiliate(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              {t('msg.cookie_affiliate')}
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManage((v) => !v)}>
            {t('action.manage_preferences')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setAffiliateConsent(false)}
          >
            {t('action.reject_non_essential')}
          </Button>
          <Button
            onClick={() => {
              if (manage && !affiliate) {
                void setAffiliateConsent(false);
              } else {
                void setAffiliateConsent(true);
              }
            }}
          >
            {manage ? t('action.save') : t('action.accept_all')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Capture an `affcode` only when affiliate consent is already affirmative. */
export function AffiliateCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('affcode')?.trim().toUpperCase();
    if (!code || !/^[A-Z0-9]{3,40}$/.test(code)) return;
    if (!readConsent()?.affiliate) return;
    void fetch('/api/affiliate/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => undefined);
  }, [pathname, searchParams]);

  return null;
}
