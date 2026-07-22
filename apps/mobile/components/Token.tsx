// @/components/Token.tsx

import React, { useRef, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Typography } from "@/constants/Typography";
import { useSettings } from "@/contexts/SettingsContext";
import { TouchableOpacity } from "react-native";
import { PopupDictionaryModal } from "./PopupDictionaryModal";
import { Token as TokenType } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { matchHiragana, Segment } from "@/src/furigana";
import { useUserData } from "@/contexts/UserDataContext";
import { DictionaryEntry } from "@/src/dictionary-types";
import { LevelColors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "./ThemedText";
import { DefinitionList } from "./DefinitionList";
import he from 'he';

interface TokenProps {
  token: TokenType;
  textScale?: number;
  textWeight?: "regular" | "bold";
  context?: string;
  translatedContext?: string;
  decodeHTML?: boolean;
  onPopupOpen?: () => void;
  onPopupClose?: () => void;
}

interface SegmentProps {
  segment: Segment;
  index: number;
  shouldShowPronunciation: boolean;
  styles: {
    segment: ViewStyle;
    pronunciation: TextStyle;
    mainText: TextStyle;
  };
  fontFamily: string;
  primaryTextColor: string;
  defaultFontSize: number;
  textScale: number;
  savedWord: DictionaryEntry | null;
  savedWordColor: (level?: number) => string;
  isBlank: boolean;
}

export const Token: React.FC<TokenProps> = ({
  token,
  textScale = 1,
  textWeight = "regular",
  context = "",
  translatedContext = "",
  decodeHTML = false,
  onPopupOpen,
  onPopupClose,
}) => {
  const defaultFontSize = 16;
  const primaryTextColor = useThemeColor({}, "primaryText");
  const primaryStrokeColor = useThemeColor({}, "primaryStroke");
  const fontFamily = textWeight === "bold" ? Typography.fontFamilyBold : Typography.fontFamilyRegular;
  const { l1Lang, l2Lang } = useLanguage();
  if (!l2Lang) return;
  const { settings } = useSettings();
  const { convert, dictionary } = useDictionary();
  const modalRef = useRef<typeof PopupDictionaryModal>(null);
  const { savedWords, getSavedWordByForm } = useUserData();
  const [savedWord, setSavedWord] = useState<DictionaryEntry | null>(null);
  const [firstDefinition, setFirstDefinition] = useState<string | null>(null);
  const [isBlank, setIsBlank] = useState<boolean>(false);
  const colorScheme = useColorScheme();
  const semanticSuccessColor = useThemeColor({}, "semanticSuccess");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const semanticWarningColor = useThemeColor({}, "semanticWarning");

  const checkSavedWord = async () => {
    const savedWordMeta = getSavedWordByForm(l2Lang.code, token.text);
    const savedWord = dictionary && savedWordMeta ? await dictionary.getEntry(savedWordMeta.id) : null;
    setSavedWord(savedWord);
    const l1Code = l1Lang?.code.split('-')[0];
    const l2Code = l2Lang.code;
    if (savedWord && settings.showQuickGloss && savedWord.definitions.length > 0 && l1Code !== l2Code) {
      const defString = savedWord.definitions[0]
      setFirstDefinition(defString);
    } else {
      setFirstDefinition(null);
    }
    setIsBlank(settings.quizMode && !!savedWord);
  };

  useEffect(() => {
    checkSavedWord();
  }, [savedWords, token.text, dictionary]);

  const handleTokenPress = () => {
    if (settings.quizMode && savedWord) {
      setIsBlank(!isBlank);
    } else {
      onPopupOpen?.();
      modalRef.current?.open();
    }
  };

  const handlePopupClose = () => {
    onPopupClose?.();
  };

  const shouldShowPronunciation = settings.showPinyin && token.pronunciation && token.pronunciation !== token.text && !isBlank;

  const savedWordColor = (level: number | undefined = undefined): string => {
    return level ? LevelColors[colorScheme][level] || semanticWarningColor : semanticWarningColor;
  };

  const { displayContent, decodedToken } = useMemo(() => {
    let processedText = decodeHTML ? he.decode(token.text) : token.text;
    let processedPronunciation = decodeHTML ? he.decode(token.pronunciation || '') : (token.pronunciation || '');

    let segments: Segment[];
    if (l2Lang?.code === 'ja') {
      segments = matchHiragana({ text: processedText, pronunciation: processedPronunciation });
    } else if (convert && l2Lang?.han && processedText) {
      segments = [{ text: convert(processedText), pronunciation: processedPronunciation }];
    } else {
      segments = [{ text: processedText, pronunciation: processedPronunciation }];
    }

    const decodedToken: TokenType = {
      ...token,
      text: processedText,
      pronunciation: processedPronunciation
    };

    return { displayContent: segments, decodedToken };
  }, [token, convert, l2Lang.code, l2Lang.han, decodeHTML]);

  const renderSegment = ({ segment, index, shouldShowPronunciation, styles, fontFamily, primaryTextColor, defaultFontSize, textScale, savedWord, savedWordColor, isBlank }: SegmentProps) => (
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
            opacity: isBlank ? 0 : 1,
          },
          ...(savedWord ? [{ color: savedWordColor(savedWord.level) }] : []),
        ]}
      >
        {segment.text}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity onPress={handleTokenPress} style={{ flexDirection: 'row', alignItems: 'flex-end', borderColor: isBlank ? primaryStrokeColor : 'transparent', borderBottomWidth: 1 }}>
      <View style={[
        styles.token,
        shouldShowPronunciation ? styles.tokenWithPronunciation : null
      ]}>
        {displayContent.map((segment, index) => renderSegment({
          segment,
          index,
          shouldShowPronunciation,
          styles,
          fontFamily,
          primaryTextColor,
          defaultFontSize,
          textScale,
          savedWord,
          savedWordColor,
          isBlank
        }))}
      </View>
      {firstDefinition && <DefinitionList definitions={[firstDefinition]} brief={true} style={{ marginBottom: 2 }} />}
      <PopupDictionaryModal state={{ token: decodedToken, context: he.decode(context), translatedContext }} ref={modalRef} key={decodedToken.text} onClose={handlePopupClose} />
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
  firstDefinition: {
    marginTop: 4,
  },
});

export default Token;