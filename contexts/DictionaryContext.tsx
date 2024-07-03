// Updated DictionaryProvider with integrated modal display

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dictionary } from '@/src/dictionary';
import { TokenizerService } from '@/src/tokenizer';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryLoadingModal } from '@/components/DictionaryLoadingModal';

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
  const { l2Lang } = useLanguage();
  
  useEffect(() => {
    if (!l2Lang) return;
    setIsLoading(true);
    const newDictionary = new Dictionary(l2Lang);
    console.log('DictionaryContext: Loading the dictionary...');
    newDictionary.loadData(false).then(() => {
      setDictionary(newDictionary);
      const initializeTokenizer = async () => {
        const tokenizer = TokenizerService.getInstance(await newDictionary.getWordSet());
        setTokenizer(tokenizer);
      };
      initializeTokenizer();
      console.log('DictionaryContext: Dictionary is ready and loaded.');
      setIsLoading(false);
    }).catch(error => {
      console.error('DictionaryContext: Failed to load dictionary:', error);
      setIsLoading(false);
    });
  }, [l2Lang]);

  return (
    <DictionaryContext.Provider value={{ dictionary, tokenizer }}>
      {isLoading && <DictionaryLoadingModal />}
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextProps => useContext(DictionaryContext);
