import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, Platform, ActionSheetIOS, Modal, TouchableOpacity } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { DictionaryProvider } from "@/contexts/DictionaryContext";
import { WordList } from "@/components/WordList";
import { useUserData } from "@/contexts/UserDataContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

const SavedWordsScreen = () => {
  const { savedWords, clearSavedWords } = useUserData();
  const { l2Lang, t } = useLanguage();
  const [savedWordIds, setSavedWordIds] = useState<string[] | null>(null);
  const [isAndroidMenuVisible, setIsAndroidMenuVisible] = useState(false);

  useEffect(() => {
    if (savedWords && l2Lang) {
      const savedWordsData = savedWords[l2Lang.code];
      if (savedWordsData) {
        setSavedWordIds(savedWordsData.map(word => word.id));
      } else {
        setSavedWordIds([]);
      }
    }
  }, [savedWords, l2Lang]);

  const handleClearWords = () => {
    if (l2Lang) {
      clearSavedWords(l2Lang.code);
    }
  };

  const showIOSActionSheet = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('action.cancel'), t('action.clear_words')],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) {
          handleClearWords();
        }
      }
    );
  };

  const handleAction = () => {
    if (Platform.OS === 'ios') {
      showIOSActionSheet();
    } else {
      setIsAndroidMenuVisible(true);
    }
  };

  const AndroidMenu = () => (
    <Modal
      transparent={true}
      visible={isAndroidMenuVisible}
      onRequestClose={() => setIsAndroidMenuVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        onPress={() => setIsAndroidMenuVisible(false)}
      >
        <ThemedView style={styles.modalContent}>
          <TouchableOpacity onPress={() => {
            setIsAndroidMenuVisible(false);
            handleClearWords();
          }}>
            <ThemedText style={styles.menuItem}>{t('action.clear_words')}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <ThemedScreen
      title={t('title.saved_words')}
      onBackPress={() => {
        router.navigate('/(tabs)/(me)');
      }}
      onAction={handleAction}
    >
      {savedWordIds && savedWordIds.length > 0 ? (
        <WordList wordIds={savedWordIds} />
      ) : (
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText} type="large" variant="secondary">{t('msg.no_saved_words')}</ThemedText>
        </View>
      )}

      {Platform.OS === 'android' && <AndroidMenu />}
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '90%',
  },
  emptyStateText: {
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  menuItem: {
    fontSize: 18,
    paddingVertical: 10,
  },
});

export default SavedWordsScreen;