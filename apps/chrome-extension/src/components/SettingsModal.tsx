import React, { useEffect, useState, useMemo } from 'react';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Segmented } from './ui/segmented';
import { t, log, logerr, logwarn, getLocaleVersion } from '../i18n';
import { API_BASE } from '../api-config';
import { apiFetch } from '../api-fetch';
import { getSampleSentence } from '@langplayer/shared';
import {
  type PlaybackSettings,
  type SpeechSettings,
  DEFAULT_PLAYBACK,
  DEFAULT_SPEECH,
  loadPlaybackSettings,
  savePlaybackSettings,
  loadSpeechSettings,
  saveSpeechSettings,
  applySpeechToUtterance,
} from '../extension-settings';

type Theme = 'light' | 'dark' | 'system';
type PhoneticsMode = 'above' | 'replace' | 'off';
type SettingsCategory = 'display' | 'playback' | 'speech';

export interface ExtensionDisplaySettings {
  theme: Theme;
  showTranslation: boolean;
  /** Show an inline first definition after saved words (apps/web quick gloss). */
  showGlossSaved: boolean;
  typeFace: 'default' | 'serif' | 'sans-serif';
  textSize: number;
  translationSize: number;
  leading: number;
  phoneticsMode: PhoneticsMode;
  phoneticsScope: 'all' | 'hard';
}

const DEFAULTS: ExtensionDisplaySettings = {
  theme: 'system', showTranslation: false, showGlossSaved: true, typeFace: 'default', textSize: 24,
  translationSize: 0.75, leading: 1.5, phoneticsMode: 'above', phoneticsScope: 'all',
};

// Flat extension keys used to resolve locale-agnostic search terms per category
// (apps/web SettingsListPanel + ADR-0015: match titles AND control labels).
const SEARCH_TERMS: Record<SettingsCategory, string[]> = {
  display: [
    'theme', 'light', 'dark', 'system', 'typeface', 'defaultTypeface', 'serif', 'sansSerif',
    'textSize', 'translationSize', 'leading', 'phonetics', 'above', 'replace', 'off',
    'scope', 'allWords', 'hardWords', 'showTranslation', 'showGlossSaved', 'quickGloss', 'gloss',
  ],
  playback: ['smoothScroll'],
  speech: ['voice', 'rate', 'speed'],
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
  const [playback, setPlayback] = useState<PlaybackSettings>(DEFAULT_PLAYBACK);
  const [speech, setSpeech] = useState<SpeechSettings>(DEFAULT_SPEECH);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sampleText, setSampleText] = useState('');
  const [sampleTranslation, setSampleTranslation] = useState('');

  const localeVersion = getLocaleVersion();

  // Load the stored settings + L2-specific sample sentence each time the dialog
  // opens (or the L2 changes). SpeechSynthesis voices load asynchronously.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setCategory('display');

    chrome.storage.local.get([
      'extensionDisplaySettings', 'theme', 'showTranslation', 'showGlossSaved', 'textSizePx', 'translationSize',
      'leading', 'typeFace', 'phoneticsMode', 'phoneticsScope',
    ]).then((stored: any) => {
      log('[LP Extension] SettingsModal read chrome.storage.local keys:',
        Object.keys(stored).join(', ') || '(empty — settings will show defaults)');
      setSettings({
        ...DEFAULTS,
        ...(stored.extensionDisplaySettings || {}),
        theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : (stored.extensionDisplaySettings?.theme || DEFAULTS.theme),
        showTranslation: stored.showTranslation ?? stored.extensionDisplaySettings?.showTranslation ?? DEFAULTS.showTranslation,
        showGlossSaved: stored.showGlossSaved ?? stored.extensionDisplaySettings?.showGlossSaved ?? DEFAULTS.showGlossSaved,
        textSize: Number(stored.textSizePx ?? stored.extensionDisplaySettings?.textSize ?? DEFAULTS.textSize),
        translationSize: Number(stored.translationSize ?? stored.extensionDisplaySettings?.translationSize ?? DEFAULTS.translationSize),
        leading: Number(stored.leading ?? stored.extensionDisplaySettings?.leading ?? DEFAULTS.leading),
        typeFace: stored.typeFace || stored.extensionDisplaySettings?.typeFace || DEFAULTS.typeFace,
        phoneticsMode: stored.phoneticsMode || stored.extensionDisplaySettings?.phoneticsMode || DEFAULTS.phoneticsMode,
        phoneticsScope: stored.phoneticsScope || stored.extensionDisplaySettings?.phoneticsScope || DEFAULTS.phoneticsScope,
      });
    }).catch((err) => {
      logerr('[LP Extension] SettingsModal chrome.storage.local read failed — falling back to defaults:', err);
      setSettings(DEFAULTS);
    });

    loadPlaybackSettings().then(setPlayback);
    loadSpeechSettings().then(setSpeech);

    // L2-specific short sample sentence (apps/web uses loadSampleShort; the
    // extension bundles everything, so use the synchronous shared sentence).
    setSampleText(getSampleSentence(l2Code));
    setSampleTranslation('');

    const loadVoices = () => { try { setVoices(speechSynthesis.getVoices()); } catch { setVoices([]); } };
    loadVoices();
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
    }
    return () => {
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      }
    };
  }, [open, l2Code]);

  // Translate the preview sample when Show Translation is on (web parity). Avoid
  // re-fetching on every slider tick — only on sample/L1/L2/toggle change. The
  // destination L1 is the interface language stored in l1Language.
  useEffect(() => {
    if (!open || !settings.showTranslation || !sampleText) {
      setSampleTranslation('');
      return;
    }
    let cancelled = false;
    chrome.storage.local.get('l1Language').then(({ l1Language }) => {
      const l1Code = typeof l1Language === 'string' && l1Language ? l1Language : 'en';
      apiFetch(`${API_BASE}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [sampleText], l1: l1Code, l2: l2Code }),
      })
        .then((res) => res.ok ? res.json() : {})
        .then((data) => { if (!cancelled) setSampleTranslation(data.translated_texts?.[0] ?? ''); })
        .catch((err) => { logwarn('[LP Extension] SettingsModal sample translation failed:', err); if (!cancelled) setSampleTranslation(''); });
    }).catch(() => { if (!cancelled) setSampleTranslation(''); });
    return () => { cancelled = true; };
  }, [open, settings.showTranslation, sampleText, l2Code]);

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
        showGlossSaved: next.showGlossSaved,
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

  const updatePlayback = (patch: Partial<PlaybackSettings>) => {
    setPlayback((current) => {
      const next = { ...current, ...patch };
      log('[LP Extension] SettingsModal write playback settings:', next);
      savePlaybackSettings(next);
      return next;
    });
  };

  const updateSpeech = (patch: Partial<SpeechSettings>) => {
    setSpeech((current) => {
      const next = { ...current, ...patch };
      log('[LP Extension] SettingsModal write speech settings:', next);
      saveSpeechSettings(next);
      return next;
    });
  };

  // Pre-resolve search terms per category, re-resolved only when the locale
  // version changes (ADR-0015 locale-agnostic search).
  const localizedTerms: Record<SettingsCategory, string[]> = useMemo(() => ({
    display: SEARCH_TERMS.display.map((k) => t(k).toLowerCase()),
    playback: SEARCH_TERMS.playback.map((k) => t(k).toLowerCase()),
    speech: SEARCH_TERMS.speech.map((k) => t(k).toLowerCase()),
  }), [localeVersion]);

  const categoryLabels: Array<{ key: SettingsCategory; label: string }> = [
    { key: 'display', label: t('display') },
    { key: 'playback', label: t('playback') },
    { key: 'speech', label: t('speech') },
  ];
  const query = search.trim().toLowerCase();
  const visibleCategories = categoryLabels.filter(({ key, label }) => {
    if (!query) return true;
    if (label.toLowerCase().includes(query)) return true;
    return (localizedTerms[key] || []).some((term) => term.includes(query));
  });

  const l2Prefix = (l2Code || '').split('-')[0].toLowerCase();
  const l2Voices = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(l2Prefix));
  const otherVoices = voices.filter((v) => !(v.lang || '').toLowerCase().startsWith(l2Prefix));
  const voiceOptions = [
    { value: '', label: t('defaultVoice') },
    ...l2Voices.map((v) => ({ value: v.voiceURI, label: v.name })),
    ...otherVoices.map((v) => ({ value: v.voiceURI, label: v.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('settings')} closeLabel={t('close')} className="lpv-settings-dialog">
      <div className="lpv-settings-layout">
        <aside className="lpv-settings-sidebar">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchSettings')} aria-label={t('searchSettings')} />
          <nav className="lpv-settings-nav" aria-label={t('settings')}>
            {visibleCategories.map(({ key, label }) => (
              <button key={key} className={`lpv-settings-nav-item ${category === key ? 'is-active' : ''}`} onClick={() => setCategory(key)}>{label}</button>
            ))}
          </nav>
        </aside>
        <section className="lpv-settings-content">
          {category === 'display' && <DisplaySettings settings={settings} update={update} sampleText={sampleText} sampleTranslation={sampleTranslation} />}
          {category === 'playback' && <PlaybackSettings playback={playback} update={updatePlayback} />}
          {category === 'speech' && <SpeechSettings speech={speech} update={updateSpeech} voiceOptions={voiceOptions} speak={handleTestSpeak} />}
        </section>
      </div>
    </Dialog>
  );

  function handleTestSpeak() {
    try {
      const text = sampleText || getSampleSentence(l2Code);
      const utterance = new SpeechSynthesisUtterance(text);
      applySpeechToUtterance(utterance, l2Code, speech);
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch (err) {
      logwarn('[LP Extension] SettingsModal test-speak failed:', err);
    }
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lpv-settings-subsection">
      <h4 className="lpv-settings-subsection-title">{title}</h4>
      <div className="lpv-settings-block-list">{children}</div>
    </div>
  );
}

function SettingBlock({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="lpv-settings-block">
      {label && <label className="lpv-settings-block-label">{label}</label>}
      <div className="lpv-settings-block-control">{children}</div>
    </div>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="lpv-settings-row">
      <label>{label}</label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} ariaLabel={label} />
    </div>
  );
}

function DisplaySettings({ settings, update, sampleText, sampleTranslation }: {
  settings: ExtensionDisplaySettings;
  update: (patch: Partial<ExtensionDisplaySettings>) => void;
  sampleText: string;
  sampleTranslation: string;
}) {
  return (
    <div className="lpv-settings-section">
      <h3>{t('display')}</h3>

      <div className="lpv-settings-preview">
        <p className="lpv-settings-preview-token" style={{ fontSize: `${settings.textSize}px`, lineHeight: settings.leading, fontFamily: settings.typeFace === 'serif' ? 'serif' : settings.typeFace === 'sans-serif' ? 'sans-serif' : 'inherit' }}>{sampleText}</p>
        {settings.showTranslation && sampleTranslation && <p className="lpv-settings-preview-translation" style={{ fontSize: `${settings.textSize * settings.translationSize}px` }}>{sampleTranslation}</p>}
      </div>

      <Section title={t('theme')}>
        <SettingBlock label={t('theme')}>
          <Segmented value={settings.theme} onChange={(value) => update({ theme: value as Theme })} ariaLabel={t('theme')} options={[{ value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }, { value: 'system', label: t('system') }]} />
        </SettingBlock>
      </Section>

      <Section title={t('showTranslation')}>
        <ToggleRow label={t('showTranslation')} checked={settings.showTranslation} onCheckedChange={(checked) => update({ showTranslation: checked })} />
      </Section>

      <Section title={t('wordLevelDisplay')}>
        <ToggleRow label={t('showGlossSaved')} checked={settings.showGlossSaved} onCheckedChange={(checked) => update({ showGlossSaved: checked })} />
      </Section>

      <Section title={t('textAppearance')}>
        <SettingBlock label={t('typeface')}>
          <Segmented value={settings.typeFace} onChange={(value) => update({ typeFace: value as ExtensionDisplaySettings['typeFace'] })} ariaLabel={t('typeface')} options={[{ value: 'default', label: t('defaultTypeface') }, { value: 'serif', label: t('serif') }, { value: 'sans-serif', label: t('sansSerif') }]} />
        </SettingBlock>
        <SettingBlock label={`${t('textSize')} (${settings.textSize}px)`}>
          <Slider value={settings.textSize} min={16} max={36} step={1} onChange={(value) => update({ textSize: value })} ariaLabel={t('textSize')} />
        </SettingBlock>
        <SettingBlock label={`${t('translationSize')} (${Math.round(settings.translationSize * 100)}%)`}>
          <Slider value={settings.translationSize} min={0.5} max={1} step={0.05} onChange={(value) => update({ translationSize: value })} ariaLabel={t('translationSize')} />
        </SettingBlock>
        <SettingBlock label={`${t('leading')} (${settings.leading.toFixed(2)}×)`}>
          <Slider value={settings.leading} min={1} max={2} step={0.125} onChange={(value) => update({ leading: value })} ariaLabel={t('leading')} />
        </SettingBlock>
      </Section>

      <Section title={t('phonetics')}>
        <SettingBlock label={t('phonetics')}>
          <Segmented value={settings.phoneticsMode} onChange={(value) => update({ phoneticsMode: value as PhoneticsMode })} ariaLabel={t('phonetics')} options={[{ value: 'above', label: t('above') }, { value: 'replace', label: t('replace') }, { value: 'off', label: t('off') }]} />
        </SettingBlock>
        {settings.phoneticsMode !== 'off' && (
          <SettingBlock label={t('scope')}>
            <Segmented value={settings.phoneticsScope} onChange={(value) => update({ phoneticsScope: value as ExtensionDisplaySettings['phoneticsScope'] })} ariaLabel={t('scope')} options={[{ value: 'all', label: t('allWords') }, { value: 'hard', label: t('hardWords') }]} />
          </SettingBlock>
        )}
      </Section>
    </div>
  );
}

function PlaybackSettings({ playback, update }: { playback: PlaybackSettings; update: (patch: Partial<PlaybackSettings>) => void }) {
  return (
    <div className="lpv-settings-section">
      <h3>{t('playback')}</h3>
      <ToggleRow label={t('smoothScroll')} checked={playback.smoothScroll} onCheckedChange={(checked) => update({ smoothScroll: checked })} />
    </div>
  );
}

function SpeechSettings({ speech, update, voiceOptions, speak }: {
  speech: SpeechSettings;
  update: (patch: Partial<SpeechSettings>) => void;
  voiceOptions: Array<{ value: string; label: string }>;
  speak: () => void;
}) {
  return (
    <div className="lpv-settings-section">
      <h3>{t('speech')}</h3>
      <Section title={t('voice')}>
        <SettingBlock label={t('voice')}>
          <Select value={speech.voiceURI} onChange={(value) => update({ voiceURI: value })} ariaLabel={t('voice')} options={voiceOptions} />
        </SettingBlock>
        <SettingBlock label={`${t('rate')} (${speech.rate.toFixed(2)}×)`}>
          <Slider value={speech.rate} min={0.25} max={2} step={0.05} onChange={(value) => update({ rate: value })} ariaLabel={t('rate')} />
        </SettingBlock>
      </Section>
      <button type="button" className="lpv-ui-button lpv-settings-test-speak" onClick={speak}>{t('testVoice')}</button>
    </div>
  );
}
