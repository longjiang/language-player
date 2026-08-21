import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { AccountModal } from './AccountModal';
import { AuthState, getAuthState, login, logout } from '../auth';
import { t } from '../i18n';

interface UserMenuProps {
  l1Code: string;
  l2Code: string;
  onSettings: () => void;
  onHelp: () => void;
  onAbout: () => void;
}

export function UserMenu({ l1Code, l2Code, onSettings, onHelp, onAbout }: UserMenuProps) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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
        {auth ? <button className="lpv-user-menu-summary" onClick={() => { setAccountOpen(true); setOpen(false); }}><strong>{displayName}</strong><span>{auth.email}</span></button> : <button className="lpv-user-menu-item" onClick={() => { setLoginOpen(true); setOpen(false); }}>{t('login')}</button>}
        <button className="lpv-user-menu-item" onClick={() => { onSettings(); setOpen(false); }}>{t('settings')}</button>
        <button className="lpv-user-menu-item" onClick={() => { onHelp(); setOpen(false); }}>{t('help')}</button>
        <button className="lpv-user-menu-item" onClick={() => { onAbout(); setOpen(false); }}>{t('about')}</button>
        {auth && <button className="lpv-user-menu-item is-destructive" onClick={handleLogout}>{t('logout')}</button>}
      </div>}
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onLoggedIn={(next) => { setAuth(next); setLoginOpen(false); }} />
      {auth && <AccountModal open={accountOpen} auth={auth} l1Code={l1Code} l2Code={l2Code} onOpenChange={setAccountOpen} onLoggedOut={() => setAuth(null)} />}
    </div>
  );
}

function LoginDialog({ open, onOpenChange, onLoggedIn }: { open: boolean; onOpenChange: (open: boolean) => void; onLoggedIn: (auth: AuthState) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(null);
    try { onLoggedIn(await login(email, password)); } catch (err: any) { setError(err?.message || t('loginFailed')); } finally { setLoading(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange} title={t('login')} closeLabel={t('close')}><form className="lpv-login-form" onSubmit={submit}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('popupEmailPlaceholder')} aria-label={t('popupEmailPlaceholder')} required /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('popupPasswordPlaceholder')} aria-label={t('popupPasswordPlaceholder')} required />{error && <p className="lpv-account-danger" role="alert">{error}</p>}<div className="lpv-dialog-actions"><Button variant="outline" type="button" onClick={() => onOpenChange(false)}>{t('close')}</Button><Button type="submit" disabled={loading}>{loading ? t('loadingSubtitles') : t('login')}</Button></div></form></Dialog>;
}
