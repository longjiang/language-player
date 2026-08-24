import React, { useEffect, useState } from 'react';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { t, log, logerr } from '../i18n';

type Theme = 'light' | 'dark' | 'system';
type PhoneticsMode = 'above' | 'replace' | 'off';
type SettingsCategory = 'display' | 'playback' | 'speech' | 'review' | 'search';

export interface ExtensionDisplaySettings {
  theme: Theme;
  showTranslation: boolean;
  typeFace: 'default' | 'serif' | 'sans-serif';
  textSize: number;
  translationSize: number;
  leading: number;
  phoneticsMode: PhoneticsMode;
  phoneticsScope: 'all' | 'hard';
}

const DEFAULTS: ExtensionDisplaySettings = {
  theme: 'system', showTranslation: false, typeFace: 'default', textSize: 24,
  translationSize: 0.75, leading: 1.5, phoneticsMode: 'above', phoneticsScope: 'all',
};

interface SettingsModalProps {
  open: boolean;
  l2Code: string;
  onOpenChange: (open: boolean) => void;
  onThemeChange: (theme: Theme) => void;
}

export function SettingsModal({ open, l2Code, onOpenChange, onThemeChange }: SettingsModalProps) {
  const [category, setCategory] = useState<SettingsCategory>('display');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    if (!open) return;
    chrome.storage.local.get([
      'extensionDisplaySettings', 'theme', 'showTranslation', 'textSizePx', 'translationSize',
      'leading', 'typeFace', 'phoneticsMode', 'phoneticsScope',
    ]).then((stored: any) => {
      log('[LP Extension] SettingsModal read chrome.storage.local keys:',
        Object.keys(stored).join(', ') || '(empty — settings will show defaults)');
      setSettings({
        ...DEFAULTS,
        ...(stored.extensionDisplaySettings || {}),
        theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : (stored.extensionDisplaySettings?.theme || DEFAULTS.theme),
        showTranslation: stored.showTranslation ?? stored.extensionDisplaySettings?.showTranslation ?? DEFAULTS.showTranslation,
        textSize: Number(stored.textSizePx ?? stored.extensionDisplaySettings?.textSize ?? DEFAULTS.textSize),
        translationSize: Number(stored.translationSize ?? stored.extensionDisplaySettings?.translationSize ?? DEFAULTS.translationSize),
        leading: Number(stored.leading ?? stored.extensionDisplaySettings?.leading ?? DEFAULTS.leading),
        typeFace: stored.typeFace || stored.extensionDisplaySettings?.typeFace || DEFAULTS.typeFace,
        phoneticsMode: stored.phoneticsMode || stored.extensionDisplaySettings?.phoneticsMode || DEFAULTS.phoneticsMode,
        phoneticsScope: stored.phoneticsScope || stored.extensionDisplaySettings?.phoneticsScope || DEFAULTS.phoneticsScope,
      });
    }).catch((err) => {
      // chrome.storage read failure is one of the few ways extension settings
      // can "reset to default" without the user clearing browser data.
      logerr('[LP Extension] SettingsModal chrome.storage.local read failed — falling back to defaults:', err);
      setSettings(DEFAULTS);
    });
    setSearch('');
    setCategory('display');
  }, [open, l2Code]);

  const update = (patch: Partial<ExtensionDisplaySettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      const textScale = Math.max(0, Math.min(4, Math.round(((next.textSize - 16) / 20) * 4)));
      log('[LP Extension] SettingsModal write chrome.storage.local', {
        extensionDisplaySettings: next,
        textScale,
      });
      chrome.storage.local.set({
        extensionDisplaySettings: next,
        theme: next.theme,
        showTranslation: next.showTranslation,
        textSizePx: next.textSize,
        textScale,
        translationSize: next.translationSize,
        leading: next.leading,
        typeFace: next.typeFace,
        phoneticsMode: next.phoneticsMode,
        phoneticsScope: next.phoneticsScope,
        showPhonetics: next.phoneticsMode !== 'off',
      }).catch(() => {});
      if (patch.theme) onThemeChange(next.theme);
      return next;
    });
  };

  const categoryLabels: Array<{ key: SettingsCategory; label: string }> = [
    { key: 'display', label: t('display') },
    { key: 'playback', label: t('playback') },
    { key: 'speech', label: t('speech') },
    { key: 'review', label: t('review') },
    { key: 'search', label: t('searchSettings') },
  ];
  const visibleCategories = categoryLabels.filter(({ label }) => label.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('settings')} closeLabel={t('close')} className="lpv-settings-dialog">
      <div className="lpv-settings-layout">
        <aside className="lpv-settings-sidebar">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchSettings')} aria-label={t('searchSettings')} />
          <nav className="lpv-settings-nav" aria-label={t('settings')}>
            {visibleCategories.map(({ key, label }) => <button key={key} className={`lpv-settings-nav-item ${category === key ? 'is-active' : ''}`} onClick={() => setCategory(key)}>{label}</button>)}
          </nav>
        </aside>
        <section className="lpv-settings-content">
          {category === 'display' ? <DisplaySettings settings={settings} update={update} /> : <UnavailableSettings label={categoryLabels.find((item) => item.key === category)?.label || ''} />}
        </section>
      </div>
    </Dialog>
  );
}

function DisplaySettings({ settings, update }: { settings: ExtensionDisplaySettings; update: (patch: Partial<ExtensionDisplaySettings>) => void }) {
  return (
    <div className="lpv-settings-section">
      <h3>{t('display')}</h3>
      <SettingRow label={t('theme')}><Select value={settings.theme} onChange={(value) => update({ theme: value as Theme })} ariaLabel={t('theme')} options={[{ value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }, { value: 'system', label: t('system') }]} /></SettingRow>
      <div className="lpv-settings-preview">
        <p className="lpv-settings-preview-token" style={{ fontSize: `${settings.textSize}px`, lineHeight: settings.leading, fontFamily: settings.typeFace === 'serif' ? 'serif' : settings.typeFace === 'sans-serif' ? 'sans-serif' : 'inherit' }}>言葉を学びましょう</p>
        {settings.showTranslation && <p className="lpv-settings-preview-translation" style={{ fontSize: `${settings.textSize * settings.translationSize}px` }}>Let’s learn a language.</p>}
      </div>
      <SettingRow label={t('showTranslation')}><Switch checked={settings.showTranslation} onCheckedChange={(checked) => update({ showTranslation: checked })} ariaLabel={t('showTranslation')} /></SettingRow>
      <SettingRow label={t('typeface')}><Select value={settings.typeFace} onChange={(value) => update({ typeFace: value as ExtensionDisplaySettings['typeFace'] })} ariaLabel={t('typeface')} options={[{ value: 'default', label: t('defaultTypeface') }, { value: 'serif', label: t('serif') }, { value: 'sans-serif', label: t('sansSerif') }]} /></SettingRow>
      <SettingRow label={`${t('textSize')} (${settings.textSize}px)`}><Slider value={settings.textSize} min={16} max={36} step={1} onChange={(value) => update({ textSize: value })} ariaLabel={t('textSize')} /></SettingRow>
      <SettingRow label={`${t('translationSize')} (${Math.round(settings.translationSize * 100)}%)`}><Slider value={settings.translationSize} min={0.5} max={1} step={0.05} onChange={(value) => update({ translationSize: value })} ariaLabel={t('translationSize')} /></SettingRow>
      <SettingRow label={`${t('leading')} (${settings.leading.toFixed(2)}×)`}><Slider value={settings.leading} min={1} max={2} step={0.125} onChange={(value) => update({ leading: value })} ariaLabel={t('leading')} /></SettingRow>
      <SettingRow label={t('phonetics')}><Select value={settings.phoneticsMode} onChange={(value) => update({ phoneticsMode: value as PhoneticsMode })} ariaLabel={t('phonetics')} options={[{ value: 'above', label: t('above') }, { value: 'replace', label: t('replace') }, { value: 'off', label: t('off') }]} /></SettingRow>
      {settings.phoneticsMode !== 'off' && <SettingRow label={t('scope')}><Select value={settings.phoneticsScope} onChange={(value) => update({ phoneticsScope: value as ExtensionDisplaySettings['phoneticsScope'] })} ariaLabel={t('scope')} options={[{ value: 'all', label: t('allWords') }, { value: 'hard', label: t('hardWords') }]} /></SettingRow>}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="lpv-settings-row"><label>{label}</label>{children}</div>;
}

function UnavailableSettings({ label }: { label: string }) {
  return <div className="lpv-settings-section"><h3>{label}</h3><p className="lpv-ui-muted">{t('settingsUnavailable')}</p></div>;
}
