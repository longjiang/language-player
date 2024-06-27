import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dictionary } from '@/src/dictionary';

interface DictionaryContextProps {
  dictionary: Dictionary | null;
}

export const DictionaryContext = createContext<DictionaryContextProps>({
  dictionary: null,
});

export const DictionaryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);

  useEffect(() => {
    const newDictionary = new Dictionary();
    console.log('DictionaryContext: Loading the dictionary...');
    newDictionary.loadData().then(() => {
      setDictionary(newDictionary);
      console.log('DictionaryContext: Dictionary is ready and loaded.');
    }).catch(error => {
      console.error('DictionaryContext: Failed to load dictionary:', error);
    });
  }, []);

  return (
    <DictionaryContext.Provider value={{ dictionary }}>
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextProps => useContext(DictionaryContext);
