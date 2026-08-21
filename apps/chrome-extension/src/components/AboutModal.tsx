import React from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { t } from '../i18n';
import { LANGUAGE_PLAYER_URL } from '../web-links';

export function AboutModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const manifest = chrome.runtime.getManifest();
  const openExternal = (url: string) => { chrome.tabs.create({ url }).catch(() => {}); };
  return <Dialog open={open} onOpenChange={onOpenChange} title={t('about')} closeLabel={t('close')} className="lpv-about-dialog"><div className="lpv-about-content"><img src={chrome.runtime.getURL('src/language-player-logo-64.png')} alt="" width="48" height="48" /><h3>{t('appName')}</h3><p>{t('aboutDescription')}</p><p className="lpv-ui-muted">{t('versionLabel')} {manifest.version}</p><div className="lpv-dialog-actions"><Button variant="outline" onClick={() => openExternal(`${LANGUAGE_PLAYER_URL}/docs/privacy-policy`)}>{t('privacy')}</Button><Button onClick={() => openExternal(LANGUAGE_PLAYER_URL)}>{t('openWebsite')}</Button></div></div></Dialog>;
}
