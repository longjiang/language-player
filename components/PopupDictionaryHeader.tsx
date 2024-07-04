// @/components/PopupDictionaryHeader.tsx

import React, { useCallback, useState, useEffect } from "react";
import { View, Text, Clipboard } from "react-native";
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
import { ChatGPT } from "@/components/ChatGPT";
import { GradientLine } from "./GradientLine";

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

  if (!(l1Lang && l2Lang)) return null;
  const [translation, setTranslation] = useState<string | null>(null);
  const [showChatGPT, setShowChatGPT] = useState(false);

  useEffect(() => {
    if (settings.autoPronounce) {
      speakText(token.text, l2Lang.code);
    }
  }, [settings.autoPronounce, token.text, l2Lang.code]);

  useEffect(() => {
    if (context && !translatedContext && l1Lang && l2Lang) {
      const translateContext = async () => {
        const trans = await translateWithBing({ text: context, l1Code: l1Lang.code, l2Code: l2Lang.code });
        setTranslation(trans);
      };
      
      translateContext();
    }
  }, [context, translatedContext, l1Lang, l2Lang]);

  const generateChatGPTPrompt = (l1Name, l2Name, l2Code, word, text) => {
    const basePrompt = `Succinctly explain using ${l1Name}, what the ${l2Name} (${l2Code}) word ‘${word}’ means in the phrase ‘${text}’.`;
    const inflectionPrompt = "Give its lemma, inflection, and morphology.";
    const inflectionNotNeeded = ['zh', 'vi', 'th', 'lo', 'km'];
    return inflectionNotNeeded.includes(l2Code) ? basePrompt : `${basePrompt} ${inflectionPrompt}`;
  };

  const onExplainPress = () => {
    setShowChatGPT(!showChatGPT);
  };

  const onSpeakPress = () => {
    speakText(token.text, l2Lang.code);
  };

  const onCopyPress = () => {
    Clipboard.setString(token.text);
    // Optionally, show a message or toast to the user indicating the copy action was successful
  };

  const chatGPTPrompt = generateChatGPTPrompt(l1Lang.name, l2Lang.name, l2Lang.code, token.text, context);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <ThemedText type="xxlarge" style={{ flex: 1 }}>
          {token.text}
        </ThemedText>
        <View style={styles.actionButtons}>
          <Icon
            name="volume-high"
            size={26}
            style={styles.iconStyle}
            onPress={onSpeakPress}
          />
          <Icon
            name="content-copy"
            size={26}
            style={styles.iconStyle}
            onPress={onCopyPress}
          />
        </View>
      </View>
      <Text style={styles.translationText}>
        <ThemedText>{token.pronunciation} • </ThemedText>
        <Translate
          l1Code={l1Lang.code}
          l2Code={l2Lang.code}
          text={token.text}
        />
      </Text>
      <ThemedButton
        type="pro"
        style={{ marginBottom: 26 }}
        title="Let ChatGPT Explain"
        onPress={onExplainPress}
        leadingIcon={
          <Icon name="chat-outline" size={20} style={styles.iconStyle} />
        }
      />
      {showChatGPT && (
        <View style={{ marginVertical: 26 }}>
          <GradientLine />
          <View style={{ marginVertical: 26 }}>
            <ChatGPT prompt={chatGPTPrompt} />
          </View>
          <GradientLine />
        </View>
      )}
      <View style={styles.contextRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.contextText} type="large">
            {context}
          </ThemedText>
          <ThemedText style={styles.translatedContextText} variant="secondary">
            {translatedContext || translation}
          </ThemedText>
        </View>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="dots-vertical" size={20} />}
        />
      </View>
    </View>
  );
};
