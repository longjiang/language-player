// @/components/ThemedButton.tsx
import React from "react";
import { Text, TouchableOpacity, StyleSheet, View } from "react-native";
import { LinearGradient } from 'expo-linear-gradient'; // Ensure to import LinearGradient
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { Typography } from "@/constants/Typography";
import { ThemedText } from "./ThemedText";

type ButtonProps = {
  type?: "primary" | "neutral" | "ghost" | "accent" | "pro";  // Added 'pro' type here
  textColor?: string;
  size?: "title" | "large" | "medium" | "small";
  title?: string;
  style?: any;
  onPress?: () => void;
  leadingIcon?: React.ReactNode; // Optional leading icon
  trailingIcon?: React.ReactNode; // Optional trailing icon
};

const fontSize = {
  title: Typography.fontSize.large,
  large: Typography.fontSize.medium,
  medium: Typography.fontSize.medium,
  small: Typography.fontSize.small,
};

export function ThemedButton({
  type = "primary",
  size = "large",
  title,
  onPress,
  leadingIcon,
  trailingIcon,
  style,
  textColor,
}: ButtonProps) {
  if (!textColor) {
    textColor =
      type === "ghost" ? useThemeColor({}, "primaryText") : Swatches.neutral[0];
  }
  const secondaryTextColor = useThemeColor({}, "secondaryText");

  const getBackgroundColor = (type) => {
    const colorMap = {
      neutral: "transparent",
      accent: useThemeColor({}, "secondaryBackground"),
      primary: useThemeColor({}, "primaryBrand"),
      ghost: "transparent",
      pro: null, // Gradient handled separately for 'pro' type
    };
    return colorMap[type] || useThemeColor({}, "primaryBrand"); // Default to 'primaryBrand' if type is not specified
  };

  const backgroundColor = getBackgroundColor(type);
  const borderColor = type === "neutral" ? secondaryTextColor : "transparent";


  const buttonContainerStyle = {
    alignItems: "center",
    justifyContent: "center",
    display: "flex",
    flexDirection: "row",
    ...style, // From the props
  };

  const buttonFillStyle = {
    backgroundColor,
    borderRadius: 8,
    borderColor,
    borderWidth: 2,
  };

  const paddingStyles = type === 'ghost' ? {} : contentStyles[size];

  const buttonContentStyle = {
    alignItems: "center",
    justifyContent: "center",
    display: "flex",
    flexDirection: "row",
    ...paddingStyles,
  };

  const textStyle = [styles.textBase, styles.text[size], { color: textColor }];

  const gradientColors = ['#00C853', '#72C30B', '#2EC0FF', '#6C7CDE', '#D20EA7'];
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");

  return (
    <TouchableOpacity style={[type==="pro" ? buttonContainerStyle : {}]} onPress={onPress}>
      {type === 'pro' ? (
        <View style={{flex: 1}}>
          <ThemedText type="smallBold" style={{color: '#00C853'}}>PRO FEATURE</ThemedText>
          <LinearGradient
            colors={gradientColors}
            style={[buttonFillStyle, {padding: 2}]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={{ ...buttonContentStyle, backgroundColor: primaryBackgroundColor }}>
              {leadingIcon && (
                <View style={{ marginRight: 5 }}>
                  {React.cloneElement(leadingIcon, {
                    color: textColor,
                    size: fontSize[size] * 1.2,
                  })}
                </View>
              )}
              <Text style={textStyle}>{title}</Text>
              {trailingIcon && (
                <View style={{ marginLeft: 5 }}>
                  {React.cloneElement(trailingIcon, {
                    color: textColor,
                    size: fontSize[size] * 1.2,
                  })}
                </View>
              )}
            </View>
          </LinearGradient>
        </View>
      ) : (
        <View style={[buttonContainerStyle, buttonFillStyle, buttonContentStyle]}>
          {leadingIcon && (
            <View style={{ marginRight: 5 }}>
              {React.cloneElement(leadingIcon, {
                color: textColor,
                size: fontSize[size] * 1.2,
              })}
            </View>
          )}
          <Text style={textStyle}>{title}</Text>
          {trailingIcon && (
            <View style={{ marginLeft: 5 }}>
              {React.cloneElement(trailingIcon, {
                color: textColor,
                size: fontSize[size] * 1.2,
              })}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  textBase: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Nunito",
  },
  text: {
    title: { fontSize: fontSize.title },
    large: { fontSize: fontSize.large },
    small: { fontSize: fontSize.small },
  },
});

const contentStyles = {
  large: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  medium: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  small: {
    paddingVertical: 3,
    paddingHorizontal: 16,
  },
};
