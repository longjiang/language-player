// @/contexts/DictionaryContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dictionary } from '@/src/dictionary';
import { TokenizerService } from '@/src/tokenizer';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryLoadingModal } from '@/components/DictionaryLoadingModal';
import { Converter } from 'opencc-js';
import { useSettings } from '@/contexts/SettingsContext';
import TranslationManager from '@/src/translation-manager';

interface DictionaryContextProps {
  dictionary: Dictionary | null;
  tokenizer: TokenizerService | null;
  convert: ((text: string) => string) | null;
  translationManager: TranslationManager;
}

export const DictionaryContext = createContext<DictionaryContextProps>({
  dictionary: null,
  tokenizer: null,
  convert: null,
  translationManager: TranslationManager.getInstance(),
});

export const DictionaryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [tokenizer, setTokenizer] = useState<TokenizerService | null>(null);
  const [convert, setConvert] = useState<((text: string) => string) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const { l2Lang, t } = useLanguage();
  const { settings } = useSettings();
  const translationManager = TranslationManager.getInstance();

  useEffect(() => {
    if (!l2Lang) return;

    let aborted = false;

    const addLog = (message: string) => {
      if (aborted) return;
      setLogs((prevLogs) => [...prevLogs, message]);
      console.log(message);
    };

    // Initialize tokenizer IMMEDIATELY — don't wait for dictionary to load.
    // The tokenizer uses remote endpoints for most languages and doesn't need
    // the dictionary wordset for basic tokenization.
    const tokenizerInstance = TokenizerService.getInstance(new Set<string>());
    setTokenizer(tokenizerInstance);

    const initDictionary = async () => {
      setIsLoading(true);
      const newDictionary = new Dictionary(l2Lang, t);

      addLog(t('log.loading_dictionary'));

      try {
        await newDictionary.loadData(false, addLog);
        if (aborted) return;

        setDictionary(newDictionary);

        // Optionally update tokenizer's wordset after dictionary loads
        // (for continua languages that use the local tokenizer)
        try {
          const wordSet = await newDictionary.getWordSet();
          if (!aborted) {
            // Re-initialize with the real wordset for better local tokenization
            const updatedTokenizer = TokenizerService.getInstance(wordSet);
            setTokenizer(updatedTokenizer);
          }
        } catch (tokenizerError) {
          console.error('Failed to update tokenizer wordset:', tokenizerError);
        }

        addLog(t('log.dictionary_ready'));
      } catch (error) {
        console.error('Failed to load dictionary:', error);
        addLog(t('log.failed_load_dictionary', { error }));
      } finally {
        if (!aborted) {
          setIsLoading(false);
        }
      }
    };

    initDictionary();

    return () => {
      aborted = true;
    };
  }, [l2Lang, t]);

  useEffect(() => {
    if (l2Lang?.han) {
      const converterFunction = Converter(settings.useTraditional ? { from: 'cn', to: 'tw'} : { from: 'tw', to: 'cn'});
      setConvert(() => converterFunction);
    }
  }, [l2Lang, settings.useTraditional]);

  return (
    <DictionaryContext.Provider value={{ dictionary, tokenizer, convert, translationManager }}>
      {isLoading && l2Lang && <DictionaryLoadingModal logs={logs} l2Code={l2Lang.code} />}
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextProps => useContext(DictionaryContext);