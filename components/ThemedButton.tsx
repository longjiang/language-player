// @/components/ThemedButton.tsx
import React from "react";
import { Text, TouchableOpacity, StyleSheet, View } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { Typography } from "@/constants/Typography";

type ButtonProps = {
  type?: "primary" | "neutral" | "ghost" | "accent";
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
    };
    return colorMap[type] || useThemeColor({}, "primaryBrand"); // Default to 'primaryBrand' if type is not specified
  };

  const backgroundColor = getBackgroundColor(type);
  const borderColor = type === "neutral" ? secondaryTextColor : "transparent";

  const buttonStyle = [
    style,
  ];

  const buttonContainerStyle = {
    alignItems: "center",
    justifyContent: "center",
    display: "flex",
    flexDirection: "row",
  }

  const buttonFillStyle = {
    flex: 1,
    backgroundColor,
    borderRadius: 8,
    borderColor,
    borderWidth: 2,
    ...fillStyles[type],
  }

  const buttonContentStyle = {
    alignItems: "center",
    justifyContent: "center",
    display: "flex",
    flexDirection: "row",
    ...contentStyles[size],
  }

  const textStyle = [styles.textBase, styles.text[size], { color: textColor }];

  return (
    <TouchableOpacity style={buttonContainerStyle} onPress={onPress}>
      <View style={buttonFillStyle}>
        <View style={buttonContentStyle}>
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
      </View>
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
}

const fillStyles = StyleSheet.create({
  ghost: {
    paddingHorizontal: 0,
  },
});
