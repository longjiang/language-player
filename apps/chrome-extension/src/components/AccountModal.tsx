import React, { useEffect, useState } from 'react';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { AuthState, authorizedFetch, logout } from '../auth';
import { API_BASE } from '../api-config';
import { languageName } from '../language-names';
import { languagePlayerPath } from '../web-links';
import { t } from '../i18n';
import { primaryScale, getLevelLabelWithFallback } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

interface AccountModalProps {
  open: boolean;
  auth: AuthState;
  l1Code: string;
  l2Code: string;
  onOpenChange: (open: boolean) => void;
  onLoggedOut: () => void;
}

export function AccountModal({ open, auth, l1Code, l2Code, onOpenChange, onLoggedOut }: AccountModalProps) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [level, setLevel] = useState('1');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const displayName = [auth.firstName, auth.lastName].filter(Boolean).join(' ') || auth.email;

  useEffect(() => {
    if (!open) return;
    setSubscriptionLoading(true);
    authorizedFetch(`${API_BASE}/user-subscription`).then(async (response) => {
      if (!response?.ok) throw new Error(t('subscriptionUnavailable'));
      return response.json();
    }).then((data) => setSubscription(data?.id ? data : null)).catch(() => setSubscription(null)).finally(() => setSubscriptionLoading(false));
    chrome.storage.local.get('progressLevels').then((stored: any) => setLevel(String(stored.progressLevels?.[l2Code] || 1))).catch(() => setLevel('1'));
  }, [open, l2Code]);

  const updateLevel = async (next: string) => {
    setLevel(next);
    const stored = await chrome.storage.local.get('progressLevels').catch(() => ({} as any));
    await chrome.storage.local.set({ progressLevels: { ...(stored as any).progressLevels, [l2Code]: Number(next) } });
    const response = await authorizedFetch(`${API_BASE}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ l2: l2Code, progress: { level: Number(next) } }),
    });
    if (!response?.ok) throw new Error(t('levelSaveFailed'));
  };

  const expiresOn = subscription?.expires_on ? new Date(subscription.expires_on.replace(' ', 'T')) : null;
  const isLifetime = subscription?.type === 'lifetime';
  const isActive = isLifetime || !!(expiresOn && expiresOn >= new Date());
  const willAutoRenew = ['monthly', 'annual'].includes(subscription?.type || '') && !!subscription?.payment_customer_id && isActive;
  const planLabel = subscription?.type === 'monthly' ? t('subscriptionMonthly') : subscription?.type === 'annual' ? t('subscriptionAnnual') : subscription?.type === 'lifetime' ? t('subscriptionLifetime') : t('freeAccount');

  // Level selector options — language-specific exam scale labels, matching
  // apps/web LanguageLevelSelect: "JLPT N4 — Beginner III", "HSK 3 — Beginner III",
  // "CEFR C2 — Advanced II", etc. The exam prefix/label come from the shared
  // level registry (getLevelLabelWithFallback + primaryScale); the category
  // ("Beginner III") is the localized flat levelNameN key generated from the
  // CSV level.name ICU select (chrome.i18n can't parse ICU MessageFormat).
  const buildLevelOptions = () => {
    const scaleId = primaryScale(baseCode(l2Code));
    return Array.from({ length: 7 }, (_, index) => {
      const numeric = index + 1;
      const { label, prefix } = getLevelLabelWithFallback(numeric, scaleId);
      return { value: String(numeric), label: `${prefix} ${label} — ${t('levelName' + numeric)}` };
    });
  };

  const openExternal = (url: string) => { chrome.tabs.create({ url }).catch(() => {}); };

  const handleDelete = async () => {
    if (deleteConfirmation !== 'DELETE' || deleting || willAutoRenew) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await authorizedFetch(`${API_BASE}/auth/delete-account`, { method: 'DELETE' });
      if (!response?.ok) {
        if (response?.status === 409) throw new Error(t('deleteSubscriptionFirst'));
        throw new Error(t('deleteAccountFailed'));
      }
      await logout();
      onLoggedOut();
      onOpenChange(false);
    } catch (error: any) {
      setDeleteError(error?.message || t('deleteAccountFailed'));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('account')} closeLabel={t('close')} className="lpv-account-dialog">
      <div className="lpv-account-scroll">
        {deleteOpen ? (
          <div className="lpv-account-delete-confirm">
            <h3>{t('deleteAccount')}</h3>
            <p>{t('deleteAccountWarning')}</p>
            {willAutoRenew && <p className="lpv-account-danger">{t('deleteSubscriptionFirst')}</p>}
            <label>{t('typeToConfirm')}<Input value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteError(null); }} placeholder={t('deleteConfirmation')} /></label>
            {deleteError && <p className="lpv-account-danger" role="alert">{deleteError}</p>}
            <div className="lpv-dialog-actions"><Button variant="outline" onClick={() => setDeleteOpen(false)}>{t('cancel')}</Button><Button variant="destructive" disabled={willAutoRenew || deleteConfirmation !== 'DELETE' || deleting} onClick={handleDelete}>{deleting ? t('loadingSubtitles') : t('deleteAccount')}</Button></div>
          </div>
        ) : (
          <>
            <div className="lpv-account-chip"><span className="lpv-account-avatar">{displayName.charAt(0).toUpperCase()}</span><div><strong>{displayName}</strong><span>{auth.email}</span></div></div>
            <div className="lpv-account-section"><h3>{t('learningLevel')}</h3><p>{languageName(l2Code, l1Code)}</p><Select value={level} onChange={(value) => { updateLevel(value).catch(() => {}); }} ariaLabel={t('learningLevel')} options={buildLevelOptions()} /></div>
            <div className="lpv-account-section"><h3>{t('subscription')}</h3>{subscriptionLoading ? <p>{t('loadingSubtitles')}</p> : <><span className="lpv-account-status">{planLabel}</span>{expiresOn && isActive && !isLifetime && <p>{t('daysRemaining', [String(Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / 86400000)))])}</p>}{willAutoRenew && <p>{t('autoRenews')}</p>}{!isLifetime && <Button variant="outline" size="sm" onClick={() => openExternal(languagePlayerPath(l1Code, l2Code, 'go-pro'))}>{t(subscription ? 'manageSubscription' : 'upgradeToPro')}</Button>}</>}</div>
            <div className="lpv-account-section"><h3>{t('myActivities')}</h3><Button variant="outline" onClick={() => openExternal(languagePlayerPath(l1Code, l2Code, 'watch-history'))}>{t('myActivities')}</Button></div>
            <div className="lpv-account-danger-section"><h3>{t('deleteAccount')}</h3><p>{t('deleteAccountWarning')}</p>{willAutoRenew ? <p className="lpv-account-danger">{t('deleteSubscriptionFirst')}</p> : <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>{t('deleteAccount')}</Button>}</div>
          </>
        )}
      </div>
    </Dialog>
  );
}
