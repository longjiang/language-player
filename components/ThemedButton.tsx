import React from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches, Typography } from "@/constants";
import { ThemedText } from "./ThemedText";

type ButtonProps = {
  type?: "neutral" | "accent" | "primary" | "ghost" | "pro";
  size?: "title" | "large" | "medium" | "small";
  title?: string;
  onPress?: () => void;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: ViewStyle; // ViewStyle
  disabled?: boolean;
};

export function ThemedButton({
  type = "primary",
  size = "large",
  title,
  onPress,
  leadingIcon,
  trailingIcon,
  disabled,
  style,
}: ButtonProps) {
  const primaryTextColor = useThemeColor({}, "primaryText");
  const secondaryTextColor = useThemeColor({}, "secondaryText");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");

  const universalStyles = {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
  };

  const stylesBasedOnSize = {
    title: {
      fontSize: Typography.fontSize.large,
      paddingVertical: 16,
      paddingHorizontal: 20,
    },
    large: {
      fontSize: Typography.fontSize.medium,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
    medium: {
      fontSize: Typography.fontSize.medium,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    small: {
      fontSize: Typography.fontSize.small,
      paddingVertical: 3,
      paddingHorizontal: 16,
    },
  };

  const stylesBasedOnType = {
    neutral: {
      justifyContent: "space-between",
      borderColor: secondaryTextColor,
      borderWidth: 2,
      backgroundColor: "transparent",
      color: primaryTextColor,
    },
    accent: {
      justifyContent: "space-between",
      backgroundColor: secondaryBackgroundColor,
      color: primaryTextColor,
      borderColor: "transparent",
      borderWidth: 0,
    },
    primary: {
      justifyContent: "space-between",
      backgroundColor: primaryBrandColor,
      color: Swatches.neutral[0], // White
      borderColor: "transparent",
      borderWidth: 0,
    },
    ghost: {
      justifyContent: "center",
      backgroundColor: "transparent",
      color: primaryTextColor,
      borderColor: "transparent",
      borderWidth: 0,
    },
    pro: {
      justifyContent: "space-between",
      backgroundColor: secondaryBackgroundColor,
      color: primaryTextColor,
      borderColor: "transparent",
      borderWidth: 0,
    },
  };

  const mergedViewStyle = {
    ...universalStyles,
    borderColor: stylesBasedOnType[type].borderColor,
    borderWidth: stylesBasedOnType[type].borderWidth,
    backgroundColor: stylesBasedOnType[type].backgroundColor,
    color: stylesBasedOnType[type].color,
    paddingVertical:
      type !== "ghost" ? stylesBasedOnSize[size].paddingVertical : 0,
    paddingHorizontal:
      type !== "ghost" ? stylesBasedOnSize[size].paddingHorizontal : 0,
  };

  const styledLeadingIcon = leadingIcon && React.isValidElement(leadingIcon) ? (
    <View style={{ marginRight: title ? 5 : 0, alignItems: "center" }}>
      {React.cloneElement(leadingIcon, {
        color: style?.color || stylesBasedOnType[type].color, // Ignore the lint error here
        size: stylesBasedOnSize[size].fontSize * 1.2,
      })}
    </View>
  ) : null;
  
  const styledTrailingIcon = trailingIcon && React.isValidElement(trailingIcon) ? (
    <View style={{ marginLeft: title ? 5 : 0, alignItems: "center" }}>
      {React.cloneElement(trailingIcon, {
        color: style?.color || stylesBasedOnType[type].color, // Ignore the lint error here
        size: stylesBasedOnSize[size].fontSize * 1.2,
      })}
    </View>
  ) : null;

  const gradientColors = [
    "#00C853",
    "#72C30B",
    "#2EC0FF",
    "#6C7CDE",
    "#D20EA7",
  ];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1, ...style }}
    >
      {type === "pro" && (
        <ThemedText
          type="smallBold"
          style={{ color: "#2EC0FF", alignSelf: "center" }}
        >
          PRO FEATURE
        </ThemedText>
      )}
      <LinearGradient
        colors={type === "pro" ? gradientColors : []}
        style={{
          padding: type === "pro" ? 2 : 0,
          borderRadius: universalStyles.borderRadius,
        }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={{ ...mergedViewStyle, justifyContent: title && trailingIcon ? 'space-between' : 'space-evenly' }}>
          {styledLeadingIcon}
          {title && (
            <ThemedText
              type="title"
              style={{ fontSize: stylesBasedOnSize[size].fontSize, color: style?.color || mergedViewStyle.color }} // Ignore the lint error here
            >
              {title}
            </ThemedText>
          )}
          {styledTrailingIcon}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
