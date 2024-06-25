import React, { useContext, useRef } from 'react';
import { ScrollView, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedRBSheet } from '@/components/ThemedRBSheet';
import { PopupDictionaryContent } from '@/components/PopupDictionaryContent';
import { PopupDictionaryHeader } from '@/components/PopupDictionaryHeader';
import { DictionaryContext } from '@/contexts/DictionaryContext'; // Adjust the path as necessary

const PopupDictionaryModal = () => {
    const { state, setState } = useContext(DictionaryContext);
    const refRBSheet = useRef();

    const openModal = () => refRBSheet.current?.open();
    const closeModal = () => {
        refRBSheet.current?.close();
        // Optionally reset the state when closing the modal
        setState({ token: null, translation: null, context: null, translatedContext: null });
    };

    const screenHeight = Dimensions.get("screen").height;

    return (
        <ThemedRBSheet
            ref={refRBSheet}
            height={screenHeight - 200}
            onClose={closeModal}
        >
            {state.token && (
                <GestureHandlerRootView>
                    <ScrollView style={{ backgroundColor: 'red' }}>
                        <PopupDictionaryHeader {...state} />
                        <PopupDictionaryContent token={state.token} />
                    </ScrollView>
                </GestureHandlerRootView>
            )}
        </ThemedRBSheet>
    );
};

export default PopupDictionaryModal;
