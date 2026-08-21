import React, { useMemo, useState } from 'react';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { t } from '../i18n';

interface HelpModalProps { open: boolean; onOpenChange: (open: boolean) => void; }
const DOCS = [
  { id: 'watching', title: 'helpWatchingTitle', body: 'helpWatchingBody', headings: ['helpSupportedServices', 'helpWordLookup'] },
  { id: 'reading', title: 'helpReadingTitle', body: 'helpReadingBody', headings: ['helpInteractivity', 'helpPageDictionary'] },
  { id: 'settings', title: 'helpSettingsTitle', body: 'helpSettingsBody', headings: ['helpDisplayControls'] },
  { id: 'account', title: 'helpAccountTitle', body: 'helpAccountBody', headings: ['helpProfile', 'helpDeletion'] },
] as const;

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const [selected, setSelected] = useState(DOCS[0].id);
  const [search, setSearch] = useState('');
  const visible = useMemo(() => DOCS.filter((doc) => t(doc.title).toLowerCase().includes(search.trim().toLowerCase())), [search]);
  const doc = DOCS.find((item) => item.id === selected) || DOCS[0];
  return <Dialog open={open} onOpenChange={onOpenChange} title={t('help')} closeLabel={t('close')} className="lpv-help-dialog"><div className="lpv-help-layout"><aside className="lpv-help-sidebar"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchHelp')} aria-label={t('searchHelp')} /><nav className="lpv-help-nav">{visible.map((item) => <button key={item.id} className={`lpv-help-nav-item ${item.id === doc.id ? 'is-active' : ''}`} onClick={() => setSelected(item.id)}>{t(item.title)}</button>)}</nav><p className="lpv-help-toc-title">{t('onThisPage')}</p>{doc.headings.map((heading) => <a key={heading} className="lpv-help-toc-item" href={`#${heading}`}>{t(heading)}</a>)}</aside><article className="lpv-help-content"><h3>{t(doc.title)}</h3><p>{t(doc.body)}</p>{doc.headings.map((heading) => <section key={heading} id={heading}><h4>{t(heading)}</h4><p>{t(`${heading}Body`)}</p></section>)}</article></div></Dialog>;
}
