'use client';

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
import { setUserAdmin } from '@/lib/admin-api';
import { logAction, logerr } from '@/lib/logger';
import type { AdminUserSummary } from '@/types/admin';
import { useSession } from 'next-auth/react';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Grant or remove a user's admin privilege. Self-demotion is blocked both
 * here (button disabled) and server-side (Flask rejects it).
 */
export function AdminPrivilegeControl({
  user,
  onChanged,
}: {
  user: AdminUserSummary;
  onChanged: () => void;
}) {
  const t = useT();
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const isSelf = currentUserId === user.id;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const next = !user.isAdmin;
    setBusy(true);
    try {
      await setUserAdmin(user.id, next);
      logAction('admin.change', { userId: user.id, isAdmin: next });
      toast.success(next ? t('msg.admin_granted') : t('msg.admin_removed'));
      setConfirmOpen(false);
      onChanged();
    } catch (err) {
      logerr('admin privilege change failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  const isRemove = user.isAdmin;
  return (
    <>
      <Button
        variant={isRemove ? 'outline' : 'default'}
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={isSelf}
        title={isSelf ? t('msg.cannot_demote_self') : undefined}
      >
        {isRemove ? <ShieldX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {isRemove ? t('action.remove_admin') : t('action.grant_admin')}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isRemove ? t('action.remove_admin') : t('action.grant_admin')}
            </DialogTitle>
            <DialogDescription>
              {isRemove ? t('msg.remove_admin_confirm') : t('msg.grant_admin_confirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant={isRemove ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRemove ? t('action.remove_admin') : t('action.grant_admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
