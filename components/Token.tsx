// @/components/Token

import React, { useRef, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Typography } from "@/constants/Typography";
import { useSettings } from "@/contexts/SettingsContext";
import { TouchableOpacity } from "react-native-gesture-handler";
import { PopupDictionaryModal } from "./PopupDictionaryModal";
import { Token as TokenType } from "@/src/tokenizer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { addFurigana, FuriganaSegment } from "@/src/furigana";
import { tokenStyles as styles } from "@/src/styles";

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
  const { convert } = useDictionary();
  const modalRef = useRef();

  const handleTokenPress = () => {
    modalRef.current?.open();
  };

  const shouldShowPronunciation = settings.showPinyin && token.pronunciation !== token.text;

  const displayContent = useMemo(() => {
    if (l2Lang.code === 'ja') {
      return addFurigana({ text: token.text, pronunciation: token.pronunciation });
    } else if (convert && l2Lang.han && token.text) {
      return [{ text: convert(token.text), pronunciation: token.pronunciation }];
    }
    return [{ text: token.text, pronunciation: token.pronunciation }];
  }, [token.text, token.pronunciation, convert, l2Lang.code, l2Lang.han]);

  return (
    <>
      <TouchableOpacity onPress={handleTokenPress}>
        <View style={styles.token}>
          {displayContent.map((segment: FuriganaSegment, index: number) => (
            <View key={index} style={styles.segment}>
              {shouldShowPronunciation && segment.pronunciation !== segment.text && (
                <Text
                  style={[
                    styles.pronunciation,
                    {
                      fontFamily,
                      color: primaryTextColor,
                      fontSize: defaultFontSize * textScale * 0.618,
                    }
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
                  }
                ]}
              >
                {segment.text}
              </Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
      <PopupDictionaryModal state={{ token, context, translatedContext }} ref={modalRef} key={token.text} />
    </>
  );
};

export default Token;