import React, { useContext, useRef, useImperativeHandle, forwardRef } from 'react';
import { ScrollView, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedRBSheet } from '@/components/ThemedRBSheet';
import { PopupDictionaryContent } from '@/components/PopupDictionaryContent';
import { PopupDictionaryHeader } from '@/components/PopupDictionaryHeader';

export const PopupDictionaryModal = forwardRef((state, ref) => {
    const refRBSheet = useRef();
    state = state.state

    const openModal = () => refRBSheet.current?.open();
    const closeModal = () => refRBSheet.current?.close();

    // Use useImperativeHandle to expose methods to the parent component
    useImperativeHandle(ref, () => ({
        open: openModal,
        close: closeModal,
    }));

    const screenHeight = Dimensions.get("screen").height;

    return (
        <ThemedRBSheet
            ref={refRBSheet}
            height={screenHeight - 200}
            onClose={closeModal}
        >
            {state.token && (
                <GestureHandlerRootView>
                    <ScrollView>
                        <PopupDictionaryHeader {...state} />
                        <PopupDictionaryContent token={state.token} />
                    </ScrollView>
                </GestureHandlerRootView>
            )}
        </ThemedRBSheet>
    );
});
