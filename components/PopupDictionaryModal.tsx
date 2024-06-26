import React, { useContext, useRef, useImperativeHandle, forwardRef } from 'react';
import { ScrollView, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedRBSheet } from '@/components/ThemedRBSheet';
import { PopupDictionaryContent } from '@/components/PopupDictionaryContent';
import { PopupDictionaryHeader } from '@/components/PopupDictionaryHeader';
import { Token as TokenType } from '@/types/tokenTypes';

// Define the structure of the state expected by the component
interface PopupDictionaryModalState {
    token: TokenType;
    context?: string; // '?' makes the property optional
    translatedContext?: string;
}

// Define the props structure, if needed. Here, we do not have specific props other than state.
interface PopupDictionaryModalProps {
    state: PopupDictionaryModalState;
}

export const PopupDictionaryModal = forwardRef<typeof ThemedRBSheet, PopupDictionaryModalProps>((props, ref) => {
    const refRBSheet = useRef<typeof ThemedRBSheet>(null);
    const { state } = props; // Destructuring state from props for clearer access

    const openModal = () => {
      refRBSheet.current?.open();
    };
    const closeModal = () => {
      refRBSheet.current?.close();
    };

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
            closeOnPressMask={true}
        >
            {state.token && (
                <GestureHandlerRootView>
                    <ScrollView>
                        <PopupDictionaryHeader token={state.token} context={state.context} translatedContext={state.translatedContext} />
                        <PopupDictionaryContent token={state.token} />
                    </ScrollView>
                </GestureHandlerRootView>
            )}
        </ThemedRBSheet>
    );
});
