import React, { useRef } from "react";
import { View, Text } from "react-native";
import { ThemedText } from "./ThemedText"; // Assuming this is already defined
import { useThemeColor } from "@/hooks/useThemeColor";
import { Typography } from "@/constants/Typography";
import { useDictionary } from "@/contexts/DictionaryContext";
import { TouchableOpacity } from "react-native-gesture-handler";
import { PopupDictionaryModal } from "./PopupDictionaryModal";
import { Token as TokenType } from "@/src/tokenizer";
import { useSettings } from "@/contexts/SettingsContext"; // Import the useSettings hook

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
  const fontFamily =
    textWeight === "bold"
      ? Typography.fontFamilyBold
      : Typography.fontFamilyRegular;

  const { settings } = useSettings(); // Use the settings context
  const modalRef = useRef();

  const handleTokenPress = () => {
    modalRef.current?.open();
  };

  // Determine if pronunciation should be shown
  const shouldShowPronunciation = settings.showPhonetics && token.pronunciation !== token.text;

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
          {shouldShowPronunciation && ( // Conditionally render based on showPhonetics setting
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
            {token.text}
          </Text>
        </View>
      </TouchableOpacity>
      <PopupDictionaryModal state={{ token, context, translatedContext }} ref={modalRef} key={token.text} />
    </>
  );
};

export default Token;
