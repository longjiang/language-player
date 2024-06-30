import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dictionary } from '@/src/dictionary';
import { TokenizerService } from '@/src/tokenizer';

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
  const tokenizer = TokenizerService.getInstance();
  
  useEffect(() => {
    const newDictionary = new Dictionary('zh');
    console.log('DictionaryContext: Loading the dictionary...');
    newDictionary.loadData(false).then(() => {
      setDictionary(newDictionary);
      console.log('DictionaryContext: Dictionary is ready and loaded.');
    }).catch(error => {
      console.error('DictionaryContext: Failed to load dictionary:', error);
    });
  }, []);

  return (
    <DictionaryContext.Provider value={{ dictionary, tokenizer }}>
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextProps => useContext(DictionaryContext);
