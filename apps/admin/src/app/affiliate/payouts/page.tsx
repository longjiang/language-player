'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { completeAffiliateOnboarding, fetchAffiliateMe, updateAffiliatePayouts } from '@/lib/affiliate-api';
import { logerr } from '@/lib/logger';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function AffiliatePayoutsPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAffiliateMe()
      .then((me) => setEmail(me.paypalEmail || ''))
      .catch((err) => {
        logerr('affiliate payouts load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await updateAffiliatePayouts(email);
      router.push('/affiliate');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await completeAffiliateOnboarding();
      router.push('/affiliate');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AffiliateShell>
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>{t('label.payouts')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('msg.payout_hint')}</p>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="paypal" className="text-sm font-medium">
                  {t('label.paypal_email')}
                </label>
                <Input
                  id="paypal"
                  type="email"
                  className="mt-1.5"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={saving || !email.trim()}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('action.save')}
                </Button>
                <Button variant="ghost" onClick={skip} disabled={saving}>
                  {t('action.skip')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
