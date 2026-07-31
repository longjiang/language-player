/**
 * LanguageSwitchModal — Modal for switching L1 (I speak) / L2 (I'm learning).
 *
 * Mirrors the web app's LanguagePicker: two side-by-side columns with
 * search inputs and scrollable language lists. Opens from a Languages icon
 * button in the panel header.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Globe, X, ArrowRight } from './Icons';
import { SUPPORTED_L2S } from '@langplayer/shared';
import { t, log } from '../i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface LanguageSwitchModalProps {
  /** Current L1 code */
  l1Code: string;
  /** Current L2 code */
  l2Code: string;
  /** All supported UI languages (L1 options) */
  uiLanguages: string[];
  /** Get a language's display name in the given context */
  languageName: (code: string) => string;
  /** Called when user confirms new language pair */
  onConfirm: (l1: string, l2: string) => void;
  /** Called when user dismisses the modal */
  onClose: () => void;
}

/** Popular languages shown first in each column */
const POPULAR_L1 = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi'];
const POPULAR_L2 = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi'];

// ── Component ──────────────────────────────────────────────────────────────

export const LanguageSwitchModal: React.FC<LanguageSwitchModalProps> = ({
  l1Code,
  l2Code,
  uiLanguages,
  languageName,
  onConfirm,
  onClose,
}) => {
  const [selectedL1, setSelectedL1] = useState(l1Code);
  const [selectedL2, setSelectedL2] = useState(l2Code);
  const [l1Search, setL1Search] = useState('');
  const [l2Search, setL2Search] = useState('');

  // Filter L1 options
  const filteredL1 = useMemo(() => {
    const q = l1Search.toLowerCase().trim();
    if (!q) {
      const popular = POPULAR_L1.filter(c => uiLanguages.includes(c));
      const rest = uiLanguages.filter(c => !POPULAR_L1.includes(c));
      return { popular, rest, searching: false };
    }
    const results = uiLanguages.filter(c =>
      languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q)
    );
    return { popular: results, rest: [], searching: true };
  }, [l1Search, uiLanguages, languageName]);

  // Filter L2 options
  const filteredL2 = useMemo(() => {
    const q = l2Search.toLowerCase().trim();
    if (!q) {
      const popular = POPULAR_L2.filter(c => SUPPORTED_L2S.includes(c as any));
      const rest = SUPPORTED_L2S.filter(c => !POPULAR_L2.includes(c as any));
      return { popular, rest, searching: false };
    }
    const results = SUPPORTED_L2S.filter(c =>
      languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q)
    );
    return { popular: results as string[], rest: [], searching: true };
  }, [l2Search, languageName]);

  const handleConfirm = useCallback(() => {
    if (!selectedL1 || !selectedL2) return;
    log('Language modal confirm:', selectedL1, '→', selectedL2);
    onConfirm(selectedL1, selectedL2);
  }, [selectedL1, selectedL2, onConfirm]);

  // Stop click propagation inside modal
  const stopProp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="lpv-modal-backdrop" onClick={onClose}>
      <div className="lpv-modal" onClick={stopProp}>
        {/* Header */}
        <div className="lpv-modal-header">
          <h2 className="lpv-modal-title">{t('language') || 'Language'}</h2>
          <button onClick={onClose} className="lpv-modal-close" title={t('close')}>
            <X size={18} />
          </button>
        </div>

        {/* Two-column language picker */}
        <div className="lpv-modal-columns">
          {/* L1: I speak */}
          <div className="lpv-modal-column">
            <div className="lpv-modal-column-header">
              <Globe size={18} className="lpv-icon-primary" />
              <h3>{t('iSpeak') || 'I speak'}</h3>
            </div>
            <div className="lpv-modal-search">
              <Search size={14} className="lpv-search-icon" />
              <input
                type="text"
                value={l1Search}
                onChange={e => setL1Search(e.target.value)}
                className="lpv-modal-search-input"
                placeholder={t('searchLanguages') || 'Search languages…'}
              />
            </div>
            <div className="lpv-modal-list">
              {filteredL1.popular.length > 0 && (
                <>
                  {!filteredL1.searching && (
                    <div className="lpv-modal-list-label">{t('popularLanguages')}</div>
                  )}
                  {filteredL1.popular.map(code => (
                    <button
                      key={code}
                      onClick={() => setSelectedL1(code)}
                      className={`lpv-modal-item ${selectedL1 === code ? 'lpv-modal-item-selected' : ''}`}
                    >
                      <span>{languageName(code)}</span>
                      <span className="lpv-modal-item-code">{code.toUpperCase()}</span>
                    </button>
                  ))}
                </>
              )}
              {filteredL1.rest.length > 0 && (
                <>
                  <div className="lpv-modal-divider" />
                  <div className="lpv-modal-list-label">{t('allLanguages')}</div>
                  {filteredL1.rest.map(code => (
                    <button
                      key={code}
                      onClick={() => setSelectedL1(code)}
                      className={`lpv-modal-item ${selectedL1 === code ? 'lpv-modal-item-selected' : ''}`}
                    >
                      <span>{languageName(code)}</span>
                      <span className="lpv-modal-item-code">{code.toUpperCase()}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Arrow separator */}
          <div className="lpv-modal-arrow-col">
            <ArrowRight size={24} className="lpv-icon-muted" />
          </div>

          {/* L2: I'm learning */}
          <div className="lpv-modal-column">
            <div className="lpv-modal-column-header">
              <Globe size={18} className="lpv-icon-primary" />
              <h3>{t('iLearning') || "I'm learning"}</h3>
            </div>
            <div className="lpv-modal-search">
              <Search size={14} className="lpv-search-icon" />
              <input
                type="text"
                value={l2Search}
                onChange={e => setL2Search(e.target.value)}
                className="lpv-modal-search-input"
                placeholder={t('searchLanguages') || 'Search languages…'}
              />
            </div>
            <div className="lpv-modal-list">
              {filteredL2.popular.length > 0 && (
                <>
                  {!filteredL2.searching && (
                    <div className="lpv-modal-list-label">{t('popularLanguages')}</div>
                  )}
                  {filteredL2.popular.map(code => (
                    <button
                      key={code}
                      onClick={() => setSelectedL2(code)}
                      className={`lpv-modal-item ${selectedL2 === code ? 'lpv-modal-item-selected' : ''}`}
                    >
                      <span>{languageName(code)}</span>
                      <span className="lpv-modal-item-code">{code.toUpperCase()}</span>
                    </button>
                  ))}
                </>
              )}
              {filteredL2.rest.length > 0 && (
                <>
                  <div className="lpv-modal-divider" />
                  <div className="lpv-modal-list-label">{t('allLanguages')}</div>
                  {filteredL2.rest.map(code => (
                    <button
                      key={code}
                      onClick={() => setSelectedL2(code)}
                      className={`lpv-modal-item ${selectedL2 === code ? 'lpv-modal-item-selected' : ''}`}
                    >
                      <span>{languageName(code)}</span>
                      <span className="lpv-modal-item-code">{code.toUpperCase()}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="lpv-modal-footer">
          <span className="lpv-modal-selection">
            {selectedL1 && selectedL2 ? (
              <>{languageName(selectedL1)} → {languageName(selectedL2)}</>
            ) : (
              t('startPlaying')
            )}
          </span>
          <button
            onClick={handleConfirm}
            disabled={!selectedL1 || !selectedL2}
            className="lpv-modal-confirm-btn"
          >
            {t('confirm') || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Mount / Unmount (called by content-entry.js) ───────────────────────────

let modalRoot: ReturnType<typeof createRoot> | null = null;
let modalContainer: HTMLElement | null = null;

export function mountLanguageModal(
  l1Code: string,
  l2Code: string,
  uiLanguages: string[],
  languageName: (code: string) => string,
  onConfirm: (l1: string, l2: string) => void,
): void {
  // Create container if needed
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'lpv-language-modal-root';
    document.body.appendChild(modalContainer);
  }
  if (!modalRoot) {
    modalRoot = createRoot(modalContainer);
  }

  const handleClose = () => {
    unmountLanguageModal();
  };

  const handleConfirm = (l1: string, l2: string) => {
    onConfirm(l1, l2);
    unmountLanguageModal();
  };

  modalRoot.render(
    <LanguageSwitchModal
      l1Code={l1Code}
      l2Code={l2Code}
      uiLanguages={uiLanguages}
      languageName={languageName}
      onConfirm={handleConfirm}
      onClose={handleClose}
    />,
  );
}

export function unmountLanguageModal(): void {
  if (modalRoot) {
    modalRoot.unmount();
    modalRoot = null;
  }
  if (modalContainer) {
    modalContainer.remove();
    modalContainer = null;
  }
}
