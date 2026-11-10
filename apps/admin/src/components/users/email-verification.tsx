'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { verifyUserEmail } from '@/lib/admin-api';
import { logAction, logerr } from '@/lib/logger';
import type { AdminUserSummary } from '@/types/admin';
import { Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Email-verification status (SPEC-060 § Manual email verification).
 *
 * `emailConfirmedAt` is auth.users.email_confirmed_at — the email-specific
 * field. `confirmedAt` is the generated LEAST(email, phone) column, so it
 * says nothing about the address.
 *
 * Verifying mirrors the verify_email@ support pipe: GoTrue confirms the
 * address, then the trial + MailerLite hook runs for a user with no
 * subscription, so the account ends up in the same state as one that used
 * the confirmation link.
 */
export function EmailVerification({
  user,
  onChanged,
}: {
  user: AdminUserSummary;
  onChanged: () => void;
}) {
  const t = useT();
  const verified = Boolean(user.emailConfirmedAt);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const result = await verifyUserEmail(user.id);
      logAction('user.verify_email', {
        userId: user.id,
        alreadyVerified: result.alreadyVerified,
      });
      toast.success(t('msg.user_email_verified'));
      setConfirmOpen(false);
      onChanged();
    } catch (err) {
      logerr('email verification failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={verified ? 'success' : 'outline'}>
        {verified ? t('label.email_verified') : t('label.email_unverified')}
      </Badge>
      {!verified && (
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <MailCheck className="h-4 w-4" />
          {t('action.verify_email')}
        </Button>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('action.verify_email')}</DialogTitle>
            <DialogDescription>{t('msg.verify_email_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.verify_email')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
