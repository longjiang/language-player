import React, { useRef, useMemo } from "react";
import { View, Text } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Typography } from "@/constants/Typography";
import { useSettings } from "@/contexts/SettingsContext";
import { TouchableOpacity } from "react-native-gesture-handler";
import { PopupDictionaryModal } from "./PopupDictionaryModal";
import { Token as TokenType } from "@/src/tokenizer";
import { Converter } from 'opencc-js';  // Import the converter

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

  const { settings } = useSettings(); // Use the settings from context
  const modalRef = useRef();

  const handleTokenPress = () => {
    modalRef.current?.open();
  };

  const shouldShowPronunciation = settings.showPinyin && token.pronunciation !== token.text;

  // Using useMemo to avoid unnecessary conversions on each render
  const displayText = useMemo(() => {
    const convert = Converter({ from: 'cn', to: settings.useTraditional ? 'tw' : 'cn' });
    return convert(token.text);
  }, [token.text, settings.useTraditional]);

  return (
    <>
      <TouchableOpacity onPress={handleTokenPress}>
        <View
          style={{
            alignItems: "center",
            justifyContent: "flex-end",
            padding: 5,
          }}
        >
          {shouldShowPronunciation && (
            <Text
              style={{
                fontFamily,
                color: primaryTextColor,
                fontSize: defaultFontSize * textScale * 0.618,
                lineHeight: defaultFontSize * textScale * 0.618 * 1.14,
              }}
            >
              {token.pronunciation}
            </Text>
          )}
          <Text
            style={{
              fontFamily,
              color: primaryTextColor,
              fontSize: defaultFontSize * textScale,
              lineHeight: defaultFontSize * textScale * 1.14,
            }}
          >
            {displayText}
          </Text>
        </View>
      </TouchableOpacity>
      <PopupDictionaryModal state={{ token, context, translatedContext }} ref={modalRef} key={token.text} />
    </>
  );
};

export default Token;
