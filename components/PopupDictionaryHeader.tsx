import React, { useCallback, useState, useEffect } from "react";
import { View, StyleSheet, Text, Platform } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import { Translate } from "@/components/Translate";
import { Token } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateWithBing } from '@/src/translate';
import * as Speech from 'expo-speech';
import { Audio } from "expo-av";

interface PopupDictionaryHeaderProps {
  token: Token;
  context?: string;
  translatedContext?: string;
}

export const PopupDictionaryHeader: React.FC<PopupDictionaryHeaderProps> = ({
  token,
  context,
  translatedContext,
}) => {
  const onExplainPress = () => {
    // Implement the logic to explain the word using AI
  };
  
  const { l1Lang, l2Lang, languages } = useLanguage();
  const [translation, setTranslation] = useState<string | null>(null);

  if (context && !translatedContext && l1Lang && l2Lang) {
    const translateContext = useCallback(async () => {
      const trans = await translateWithBing({ text: context, l1Code: l1Lang.code, l2Code: l2Lang.code });
      setTranslation(trans);
    }, [context, l1Lang, l2Lang]);
    
    translateContext();
  }


  const onSpeakPress = () => {
    const text = token.text;

    // Check if the text-to-speech is available
    Speech.isSpeakingAsync().then((isSpeaking) => {
      if (isSpeaking) {
        Speech.stop();
      }
    });

    // Speak the text
    Speech.speak(text, {
      language: l2Lang.code, // Set the language to the target language
      onError: (error) => {
        console.error('Speech error occurred:', error);
        alert('An error occurred while trying to speak the text. Please check your device settings.');
      },
    });
  };

  return (
    <View style={styles.headerContainer}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <ThemedText type="xxlarge" style={{ flex: 1 }}>{token.text}</ThemedText>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Icon name="volume-high" size={26} style={styles.iconStyle} onPress={onSpeakPress} />
          <Icon name="bookmark-outline" size={26} style={styles.iconStyle} />
        </View>
      </View>
      <Text style={styles.translationText}>
        <ThemedText>{token.pronunciation} • </ThemedText>
        <Translate l1Code={l1Lang.code} l2Code={l2Lang.code} text={token.text} />
      </Text>
      <ThemedButton
        type="pro"
        style={{ marginBottom: 26 }}
        title="Let ChatGPT Explain"
        onPress={onExplainPress}
        leadingIcon={<Icon name="chat-outline" size={20} style={styles.iconStyle} />}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.contextText} type="large">{context}</ThemedText>
          <ThemedText style={styles.translatedContextText} variant="secondary">{translatedContext || translation}</ThemedText>
        </View>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="dots-vertical" size={20} />}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  contextText: {
    marginVertical: 4,
    textAlign: 'left',
    width: '100%'
  },
  translatedContextText: {
    marginVertical: 4,
    textAlign: 'left',
    width: '100%'
  },
  translationText: {
    textAlign: 'left',
    width: '100%',
    marginBottom: 20,
  },
  iconStyle: {
    marginHorizontal: 5,
    color: "white", // Adjust based on theme if needed
  },
});
