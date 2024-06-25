import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Dictionary } from '@/src/dictionary';
import { Dimensions } from 'react-native';
import { ThemedRBSheet } from '@/components/ThemedRBSheet';
import { PopupDictionaryContent } from '@/components/PopupDictionaryContent';
import { PopupDictionaryHeader } from '@/components/PopupDictionaryHeader';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

// Create the context object with additional modal control methods
const DictionaryContext = createContext({
  dictionary: null,
  openModal: () => {},
  closeModal: () => {},
  state: {
    token: null, 
    translation: null,
    context: null,
    translatedContext: null
  }
});

// Provider component that initializes the dictionary and provides it to the children
export const DictionaryProvider = ({ children }) => {
    const [dictionary, setDictionary] = useState<Dictionary | null>(null);
    const [state, setState] = useState({
      token: null, // The token that is being looked up: { word, pronunciation, lemma }
      translation: null, // Translation of the surface form of the token (token.word)
      context: null, // The sentence the word is in
      translatedContext: null // Translated of context sentence
    });

    const refRBSheet = useRef();

    useEffect(() => {
        const newDictionary = new Dictionary();
        newDictionary.loadData().then(() => {
            setDictionary(newDictionary);
            console.log('DictionaryContext: Dictionary is ready and loaded.');
        }).catch(error => {
            console.error('DictionaryContext: Failed to load dictionary:', error);
        });
    }, []);

    const screenHeight = Dimensions.get("screen").height;

    const openModal = () => {
      refRBSheet.current?.open();
    };

    const closeModal = () => {
      refRBSheet.current?.close();
    };

    const updateToken = (newToken) => {
      setState(prevState => ({ ...prevState, token: newToken }));
      console.log('DictionaryContext: Updating token:', newToken);
      console.log(state)
    };
    
    const updateTranslation = (newTranslation) => {
        setState(prevState => ({ ...prevState, translation: newTranslation }));
    };

    const updateContext = (newContext) => {
      setState(prevState => ({ ...prevState, context: newContext }));
    }

    const updateTranslatedContext = (newTranslatedContext) => {
      setState(prevState => ({ ...prevState, translatedContext: newTranslatedContext }));
    }

    return (
        <DictionaryContext.Provider value={{ dictionary, openModal, closeModal, state, updateToken, updateTranslation, updateContext, updateTranslatedContext }}>
          {children}
          <ThemedRBSheet
            ref={refRBSheet}
            height={screenHeight - 200}
            onClose={() => setState(s => ({ ...s, token: null }))}
          >
            {state.token && (
              
              <GestureHandlerRootView>
                <ScrollView>
                  <PopupDictionaryHeader  word={state.token.word}  pronunciation={state.token.pronunciation} translation={state.translation} context={state.context} translatedContext={state.translatedContext}/>
                  <PopupDictionaryContent token={state.token} />
                </ScrollView>
              </GestureHandlerRootView>
            )}
          </ThemedRBSheet>
        </DictionaryContext.Provider>
    );
};

// Custom hook to use the dictionary and modal controls
export const useDictionary = () => useContext(DictionaryContext);
