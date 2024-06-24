import React, { createContext, useContext, useState, useEffect } from 'react';
import { Dictionary } from '@/src/dictionary';
import axios from 'axios';
import Papa from 'papaparse';

// Create the context object
const DictionaryContext = createContext(null);

// Provider component that fetches the data and provides it to the children
export const DictionaryProvider = ({ children }) => {
    const [dictionary, setDictionary] = useState(null);

    useEffect(() => {
        async function loadDictionary() {
            try {
                const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
                const parsedData = Papa.parse(response.data, { header: true });
                const newDictionary = new Dictionary(parsedData.data);
                setDictionary(newDictionary);
            } catch (error) {
                console.error('Failed to load dictionary:', error);
            }
        }

        loadDictionary();
    }, []);

    return (
        <DictionaryContext.Provider value={dictionary}>
            {children}
        </DictionaryContext.Provider>
    );
};

// Custom hook to use the dictionary
export const useDictionary = () => useContext(DictionaryContext);
