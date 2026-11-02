'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { AdminApiError, deleteUser } from '@/lib/admin-api';
import { logAction, logerr } from '@/lib/logger';
import type { AdminUserSummary } from '@/types/admin';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Guard codes returned by `DELETE /admin/users/<id>` (SPEC-060 § Danger zone)
 * mapped to their translated message. The Flask `error` string is only the
 * fallback for a code this build does not know yet.
 */
const DELETE_ERROR_KEYS: Record<string, string> = {
  self_deletion: 'msg.cannot_delete_self',
  target_is_admin: 'msg.delete_user_demote_admin',
  active_subscription: 'msg.delete_user_cancel_subscription',
  affiliate_history: 'msg.delete_user_affiliate_history',
};

/**
 * Permanent account deletion. Irreversible, so the confirm button stays
 * disabled until the admin types the account's email address. Two of the four
 * server guards are also visible here from the loaded profile (self, other
 * admin); the subscription and affiliate guards need server data and surface
 * from the request.
 */
export function DeleteUserDangerZone({ user }: { user: AdminUserSummary }) {
  const t = useT();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const isSelf = currentUserId === user.id;

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const blocked = isSelf
    ? t('msg.cannot_delete_self')
    : user.isAdmin
      ? t('msg.delete_user_demote_admin')
      : '';
  // Accounts here are email-based, but never let a missing email auto-enable
  // the confirm button: fall back to the account id.
  const confirmValue = (user.email || user.id).trim().toLowerCase();
  const emailMatches = typed.trim().toLowerCase() === confirmValue;

  function closeDialog() {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError('');
  }

  async function handleDelete() {
    if (!emailMatches || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteUser(user.id);
      logAction('user.delete', { userId: user.id, email: user.email });
      toast.success(t('msg.user_deleted'));
      setOpen(false);
      // The detail page has nothing left to load, so go back to search.
      router.push('/users');
      router.refresh();
    } catch (err) {
      logerr('user delete failed', err);
      const code = err instanceof AdminApiError ? err.code : undefined;
      const key = code ? DELETE_ERROR_KEYS[code] : undefined;
      setError(
        key
          ? t(key)
          : err instanceof Error && err.message
            ? err.message
            : t('error.general'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t('label.danger_zone')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t('msg.delete_user_warning')}</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setError('');
            setTyped('');
            setOpen(true);
          }}
          disabled={Boolean(blocked)}
        >
          <Trash2 className="h-4 w-4" />
          {t('action.delete_user')}
        </Button>
        {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('action.delete_user')}</DialogTitle>
            <DialogDescription>{t('msg.delete_user_warning')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="delete-user-confirm-email" className="text-sm text-muted-foreground">
              {t('msg.delete_user_type_email', { email: user.email || user.id })}
            </label>
            <Input
              id="delete-user-confirm-email"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={user.email || user.id}
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!emailMatches || busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.delete_user')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
