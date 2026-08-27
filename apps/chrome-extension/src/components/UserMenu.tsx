import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { AuthState, getAuthState, login, logout } from '../auth';
import { LANGUAGE_PLAYER_URL } from '../web-links';
import { t } from '../i18n';

interface UserMenuProps {
  onSettings: () => void;
  onHelp: () => void;
  onAbout: () => void;
  onLogin: () => void;
  onAccount: (auth: AuthState) => void;
}

export function UserMenu({ onSettings, onHelp, onAbout, onLogin, onAccount }: UserMenuProps) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refreshAuth = async () => setAuth(await getAuthState());
  useEffect(() => { refreshAuth(); }, []);
  useEffect(() => {
    const onStorage = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes.lpv_auth) refreshAuth();
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const displayName = auth ? [auth.firstName, auth.lastName].filter(Boolean).join(' ') || auth.email : '';
  const handleLogout = async () => { await logout(); setAuth(null); setOpen(false); };

  return (
    <div ref={menuRef} className="lpv-user-menu">
      <Button variant="ghost" size="icon" className="lpv-profile-trigger" aria-label={auth ? displayName : t('login')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">{auth ? displayName.charAt(0).toUpperCase() : '◉'}</span></Button>
      {open && <div className="lpv-user-menu-popover" role="menu">
        {auth ? <button className="lpv-user-menu-summary" onClick={() => { onAccount(auth); setOpen(false); }}><strong>{displayName}</strong><span>{auth.email}</span></button> : <button className="lpv-user-menu-item" onClick={() => { onLogin(); setOpen(false); }}>{t('login')}</button>}
        <button className="lpv-user-menu-item" onClick={() => { onSettings(); setOpen(false); }}>{t('settings')}</button>
        <button className="lpv-user-menu-item" onClick={() => { onHelp(); setOpen(false); }}>{t('help')}</button>
        <button className="lpv-user-menu-item" onClick={() => { onAbout(); setOpen(false); }}>{t('about')}</button>
        {auth && <button className="lpv-user-menu-item is-destructive" onClick={handleLogout}>{t('logout')}</button>}
      </div>}
    </div>
  );
}

export function LoginDialog({ open, onOpenChange, onLoggedIn }: { open: boolean; onOpenChange: (open: boolean) => void; onLoggedIn: (auth: AuthState) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Shown after the learner taps "Sign up" or "Forgot password": account
  // creation and password reset happen on the website, so we open that page
  // and tell them to come back here to sign in.
  const [notice, setNotice] = useState<string | null>(null);

  const openWebsite = useCallback((path: string) => {
    setNotice(t('accountOnWebsiteNotice'));
    try { chrome.tabs.create({ url: `${LANGUAGE_PLAYER_URL}${path}` }); } catch {}
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(null);
    try { onLoggedIn(await login(email, password)); } catch (err: any) { setError(err?.message || t('loginFailed')); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('welcomeBack')} closeLabel={t('close')} className="lpv-login-dialog">
      <div className="lpv-login">
        <p className="lpv-login-subtitle">{t('logInToContinue')}</p>
        <form className="lpv-login-form" onSubmit={submit}>
          <label className="lpv-login-field">
            <span className="lpv-login-label">{t('popupEmailPlaceholder')}</span>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('popupEmailPlaceholder')} autoComplete="email" required />
          </label>
          <label className="lpv-login-field">
            <span className="lpv-login-label">{t('popupPasswordPlaceholder')}</span>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </label>
          <div className="lpv-login-forgot">
            <button type="button" className="lpv-login-link" onClick={() => openWebsite('/forgot-password')}>{t('forgotPassword')}</button>
          </div>
          {error && <p className="lpv-account-danger" role="alert">{error}</p>}
          {notice && <p className="lpv-login-notice" role="status">{notice}</p>}
          <Button type="submit" className="lpv-login-submit" disabled={loading}>{loading ? t('loadingSubtitles') : t('login')}</Button>
        </form>
        <p className="lpv-login-footer">
          {t('dontHaveAccount')}{' '}
          <button type="button" className="lpv-login-link lpv-login-link-strong" onClick={() => openWebsite('/register')}>{t('signUp')}</button>
        </p>
      </div>
    </Dialog>
  );
}
