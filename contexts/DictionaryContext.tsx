import React, { createContext, useContext, useState, useEffect } from 'react';
import { Dictionary } from '@/src/dictionary';

export const DictionaryContext = createContext({
  dictionary: null,
});

export const DictionaryProvider = ({ children }) => {
    const [dictionary, setDictionary] = useState<Dictionary | null>(null);

    useEffect(() => {
        const newDictionary = new Dictionary();
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

export const useDictionary = () => useContext(DictionaryContext);
