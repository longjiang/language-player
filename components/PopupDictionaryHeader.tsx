// @/components/PopupDictionaryHeader

import React, { useCallback, useState, useEffect } from "react";
import { View, Text } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import { Translate } from "@/components/Translate";
import { Token } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateWithBing } from '@/src/translate';
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";
import { speakText } from "@/src/speech";
import { useSettings } from "@/contexts/SettingsContext";

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
  
  const { l1Lang, l2Lang } = useLanguage();
  const { settings } = useSettings();

  if (!(l1Lang && l2Lang)) return;
  const [translation, setTranslation] = useState<string | null>(null);

  useEffect(() => {
    if (settings.autoPronounce) {
      speakText(token.text, l2Lang.code);
    }
  }, [settings.autoPronounce, token.text, l2Lang.code]);

  if (context && !translatedContext && l1Lang && l2Lang) {
    const translateContext = useCallback(async () => {
      const trans = await translateWithBing({ text: context, l1Code: l1Lang.code, l2Code: l2Lang.code });
      setTranslation(trans);
    }, [context, l1Lang, l2Lang]);
    
    translateContext();
  }

  const onExplainPress = () => {
    // Implement the logic to explain the word using AI
  };

  const onSpeakPress = () => {
    speakText(token.text, l2Lang.code);
  };

  return (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <ThemedText type="xxlarge" style={{ flex: 1 }}>{token.text}</ThemedText>
        <View style={styles.actionButtons}>
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
      <View style={styles.contextRow}>
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
