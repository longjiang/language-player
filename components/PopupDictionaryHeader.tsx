// @/components/PopupDictionaryHeader.tsx

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { View, Text, Clipboard } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "./ThemedText";
import { Translate } from "@/components/Translate";
import { Token } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";
import { speakText } from "@/src/speech";
import { useSettings } from "@/contexts/SettingsContext";
import { ChatGPTExplanation } from "./ChatGPTExplanation";
import { ContextRow } from "./ContextRow";
import { useDictionary } from "@/contexts/DictionaryContext";

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
  const { convert, translationManager } = useDictionary();

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
        const trans = await translationManager.translate(context, l1Lang.code, l2Lang.code);
        setTranslation(trans);
      };
      
      translateContext();
    }
  }, [context, translatedContext, l1Lang, l2Lang, translationManager]);

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

  const displayText = useMemo(() => {
    if (convert && l2Lang.han && token.text) {
      return convert(token.text);
    }
    return token.text;
  }, [token.text, convert, l2Lang.han]);

  const displayContext = useMemo(() => {
    if (convert && l2Lang.han && context) {
      return convert(context);
    }
    return context;
  }, [context, convert, l2Lang.han]);

  const chatGPTPrompt = generateChatGPTPrompt(l1Lang.name, l2Lang.name, l2Lang.code, displayText, displayContext);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <ThemedText type="xxlarge" style={{ flex: 1 }}>
          {displayText}
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
      <ChatGPTExplanation 
        showChatGPT={showChatGPT} 
        chatGPTPrompt={chatGPTPrompt} 
        onExplainPress={onExplainPress}
      />
      <ContextRow 
        context={displayContext} 
        translatedContext={translatedContext} 
        translation={translation}
      />
    </View>
  );
};
