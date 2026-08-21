import React, { useMemo, useState } from 'react';
import { CONTENT_L2S, POPULAR_L2S, SUPPORTED_L1S } from '@langplayer/shared';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { languageName, nativeLanguageName } from '../language-names';
import { t } from '../i18n';

interface LanguagePickerProps {
  open: boolean;
  l1Code: string;
  l2Code: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (l1: string, l2: string, traditional: boolean) => void;
}

type PickerTab = 'l1' | 'l2';

export function LanguagePicker({ open, l1Code, l2Code, onOpenChange, onConfirm }: LanguagePickerProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>('l2');
  const [selectedL1, setSelectedL1] = useState(l1Code);
  const [selectedL2, setSelectedL2] = useState(l2Code);
  const [search, setSearch] = useState('');
  const [traditional, setTraditional] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelectedL1(l1Code);
    setSelectedL2(l2Code);
    setSearch('');
    chrome.storage.local.get('useTraditional').then((result) => setTraditional(result.useTraditional === true)).catch(() => {});
  }, [open, l1Code, l2Code]);

  const allCodes = activeTab === 'l1' ? SUPPORTED_L1S : CONTENT_L2S;
  const popularCodes = activeTab === 'l2' ? POPULAR_L2S.filter((code) => CONTENT_L2S.includes(code)) : [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allCodes.filter((code) => {
      if (!query) return true;
      const name = activeTab === 'l1' ? nativeLanguageName(code) : languageName(code, selectedL1);
      return name.toLowerCase().includes(query) || code.toLowerCase().includes(query);
    });
  }, [activeTab, allCodes, search, selectedL1]);
  const popular = filtered.filter((code) => popularCodes.includes(code));
  const rest = filtered.filter((code) => !popularCodes.includes(code));

  const select = (code: string) => {
    if (activeTab === 'l1') {
      setSelectedL1(code);
      setActiveTab('l2');
    } else {
      setSelectedL2(code);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('changeLanguage')} closeLabel={t('close')} className="lpv-language-dialog">
      <div className="lpv-picker-tabs" role="tablist">
        <button className={`lpv-picker-tab ${activeTab === 'l1' ? 'is-active' : ''}`} role="tab" aria-selected={activeTab === 'l1'} onClick={() => setActiveTab('l1')}>{t('iSpeak')}</button>
        <button className={`lpv-picker-tab ${activeTab === 'l2' ? 'is-active' : ''}`} role="tab" aria-selected={activeTab === 'l2'} onClick={() => setActiveTab('l2')}>{t('iLearning')}</button>
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchLanguages')} aria-label={t('searchLanguages')} autoCapitalize="none" />
      <div className="lpv-language-list">
        {popular.length > 0 && (
          <div className="lpv-language-group">
            <p className="lpv-language-group-title">{t('popularLanguages')}</p>
            {popular.map((code) => <LanguageRow key={code} code={code} selected={code === (activeTab === 'l1' ? selectedL1 : selectedL2)} l1Code={selectedL1} l1={activeTab === 'l1'} onSelect={select} />)}
          </div>
        )}
        <div className="lpv-language-group">
          <p className="lpv-language-group-title">{t('allLanguages')}</p>
          {rest.map((code) => <LanguageRow key={code} code={code} selected={code === (activeTab === 'l1' ? selectedL1 : selectedL2)} l1Code={selectedL1} l1={activeTab === 'l1'} onSelect={select} />)}
          {popular.length === 0 && rest.length === 0 && <p className="lpv-ui-muted">{t('noLanguagesFound')}</p>}
        </div>
      </div>
      {selectedL2 === 'zh' && (
        <label className="lpv-picker-traditional">
          <input type="checkbox" checked={traditional} onChange={(event) => setTraditional(event.target.checked)} />
          <span>{traditional ? t('traditional') : t('simplified')}</span>
        </label>
      )}
      <div className="lpv-dialog-actions">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button>
        <Button onClick={() => onConfirm(selectedL1, selectedL2, traditional)}>{t('confirm')}</Button>
      </div>
    </Dialog>
  );
}

function LanguageRow({ code, selected, l1Code, l1, onSelect }: { code: string; selected: boolean; l1Code: string; l1: boolean; onSelect: (code: string) => void }) {
  return (
    <button className={`lpv-language-row ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(code)} dir={l1 ? undefined : 'ltr'}>
      <span>{l1 ? nativeLanguageName(code) : languageName(code, l1Code)}</span>
      <span className="lpv-language-code">{selected ? '✓' : code.toUpperCase()}</span>
    </button>
  );
}
