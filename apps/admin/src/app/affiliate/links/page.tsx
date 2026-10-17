'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { fetchAffiliateMe } from '@/lib/affiliate-api';
import type { AffiliateDashboard } from '@/types/affiliate';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AffiliateLinksPage() {
  const t = useT();
  const [data, setData] = useState<AffiliateDashboard | null>(null);
  const [path, setPath] = useState('/');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetchAffiliateMe().then(setData).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <AffiliateShell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </AffiliateShell>
    );
  }

  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  const customLink = `https://languageplayer.io${safePath}${safePath.includes('?') ? '&' : '?'}affcode=${data.code}`;

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  }

  return (
    <AffiliateShell>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{t('label.links')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            [t('label.affiliate_code'), data.code],
            [t('label.links'), data.primaryLink],
            [t('action.create_account'), data.signupLink],
          ].map(([label, value], i) => (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className="mt-1 flex gap-2">
                <Input readOnly value={String(value)} className="font-mono text-xs" />
                <Button variant="outline" onClick={() => copy(String(value), String(i))}>
                  {copied === String(i) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {t('action.copy')}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('label.links')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('msg.affiliate_link_hint')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/go-pro"
              className="font-mono text-sm"
            />
            <Button onClick={() => copy(customLink, 'custom')} variant="outline">
              {copied === 'custom' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {t('action.copy')}
            </Button>
          </div>
          <p className="break-all rounded-lg bg-muted/40 p-2 font-mono text-xs">{customLink}</p>
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
