// @/components/Token.tsx

import React, { useRef, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Typography } from "@/constants/Typography";
import { useSettings } from "@/contexts/SettingsContext";
import { TouchableOpacity } from "react-native-gesture-handler";
import { PopupDictionaryModal } from "./PopupDictionaryModal";
import { Token as TokenType } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { addFurigana, Segment } from "@/src/furigana";
import { useUserData } from "@/contexts/UserDataContext";
import { DictionaryEntry } from "@/src/dictionary-types";
import { LevelColors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export const Token: React.FC<{
  token: TokenType,
  textScale?: number,
  textWeight?: "regular" | "bold",
  context?: string,
  translatedContext?: string,
}> = ({
  token,
  textScale = 1,
  textWeight = "regular",
  context = "",
  translatedContext = "",
}) => {
  const defaultFontSize = 16;
  const primaryTextColor = useThemeColor({}, "primaryText");
  const fontFamily = textWeight === "bold" ? Typography.fontFamilyBold : Typography.fontFamilyRegular;
  const { l2Lang } = useLanguage();
  const { settings } = useSettings();
  const { convert, dictionary } = useDictionary();
  const modalRef = useRef();
  const { savedWords, getSavedWordByForm } = useUserData();
  const [ savedWord, setSavedWord ] = useState<DictionaryEntry | null>(null);
  const colorScheme = useColorScheme();
  const semanticSuccessColor = useThemeColor({}, "semanticSuccess");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const semanticWarningColor = useThemeColor({}, "semanticWarning");

  const checkSavedWord = async () => {
    if (!l2Lang) return;
    const savedWordMeta = getSavedWordByForm(l2Lang.code, token.text)
    const savedWord = dictionary && savedWordMeta ? await dictionary.getEntry(savedWordMeta.id) : null;
    setSavedWord(savedWord);
  }

  useEffect(() => {
    checkSavedWord();
  }, [savedWords, token.text, dictionary]);

  const handleTokenPress = () => {
    modalRef.current?.open();
  };

  const shouldShowPronunciation = settings.showPinyin && token.pronunciation !== token.text;

  const savedWordColor = (level: number) => {
    if (!level) return semanticWarningColor;
    return LevelColors[colorScheme][level]
  }
  
  const displayContent = useMemo(() => {
    if (l2Lang.code === 'ja') {
      return addFurigana({ text: token.text, pronunciation: token.pronunciation });
    } else if (convert && l2Lang.han && token.text) {
      return [{ text: convert(token.text), pronunciation: token.pronunciation }];
    }
    return [{ text: token.text, pronunciation: token.pronunciation }];
  }, [token.text, token.pronunciation, convert, l2Lang.code, l2Lang.han]);

  const renderSegment = (segment: { text: string; pronunciation: string }, index: number) => (
    <View key={index} style={styles.segment}>
      {shouldShowPronunciation && segment.pronunciation !== segment.text && (
        <Text
          style={[
            styles.pronunciation,
            {
              fontFamily,
              color: primaryTextColor,
              fontSize: defaultFontSize * textScale * 0.618,
              marginBottom: defaultFontSize * textScale * -0.1,
            },
            ...(savedWord ? [{ color: savedWordColor(savedWord.level) }] : []),
          ]}
        >
          {segment.pronunciation}
        </Text>
      )}
      <Text
        style={[
          styles.mainText,
          {
            fontFamily,
            color: primaryTextColor,
            fontSize: defaultFontSize * textScale,
          },
          ...(savedWord ? [{ color: savedWordColor(savedWord.level) }] : []),
        ]}
      >
        {segment.text}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity onPress={handleTokenPress}>
      <View style={[
        styles.token,
        shouldShowPronunciation ? styles.tokenWithPronunciation : null
      ]}>
        {displayContent.map(renderSegment)}
      </View>
      <PopupDictionaryModal state={{ token, context, translatedContext }} ref={modalRef} key={token.text} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  token: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tokenWithPronunciation: {
    marginHorizontal: 4,
  },
  segment: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pronunciation: {
    textAlign: 'center',
  },
  mainText: {
    textAlign: 'center',
  },
});

export default Token;