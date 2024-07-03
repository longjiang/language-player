// @/contexts/DictionaryContext.ts

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dictionary } from '@/src/dictionary';
import { TokenizerService } from '@/src/tokenizer';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryLoadingModal } from '@/components/DictionaryLoadingModal';
import { Text } from 'react-native';

interface DictionaryContextProps {
  dictionary: Dictionary | null;
  tokenizer: TokenizerService | null;
}

export const DictionaryContext = createContext<DictionaryContextProps>({
  dictionary: null,
  tokenizer: null,
});

export const DictionaryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [tokenizer, setTokenizer] = useState<TokenizerService | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const { l2Lang } = useLanguage();

  useEffect(() => {
    if (!l2Lang) return;
    setIsLoading(true);
    const newDictionary = new Dictionary(l2Lang);

    const addLog = (message: string) => {
      setLogs((prevLogs) => [...prevLogs, message]);
      console.log(message);
    };

    addLog('Loading the dictionary...');
    newDictionary.loadData(true, addLog).then(() => {
      setDictionary(newDictionary);
      const initializeTokenizer = async () => {
        const tokenizer = TokenizerService.getInstance(await newDictionary.getWordSet());
        setTokenizer(tokenizer);
      };
      initializeTokenizer();
      addLog('Dictionary is ready and loaded.');
      setIsLoading(false);
    }).catch(error => {
      addLog(`Failed to load dictionary: ${error}`);
      setIsLoading(false);
    });
  }, [l2Lang]);

  return (
    <DictionaryContext.Provider value={{ dictionary, tokenizer }}>
      {isLoading && l2Lang && <DictionaryLoadingModal logs={logs} language={l2Lang.name} />}
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextProps => useContext(DictionaryContext);
