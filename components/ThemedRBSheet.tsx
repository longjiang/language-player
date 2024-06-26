import React, { useRef, forwardRef, useImperativeHandle, ReactNode } from 'react';
import RBSheet from 'react-native-raw-bottom-sheet';
import { SafeAreaView, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";  // Assuming the hook is defined as seen in your file

// Define the types for the props of the ThemedRBSheet
interface ThemedRBSheetProps {
  children?: ReactNode;
  height?: number;
  closeOnPressMask?: boolean;
  customStyles?: {
    wrapper?: ViewStyle;
    draggableIcon?: ViewStyle;
    container?: ViewStyle;
  };
  // Include other props from RBSheet if needed, or use an intersection type with RBSheet's props
}

// Define the component with type definitions for the props and the ref
export const ThemedRBSheet = forwardRef<RBSheet, ThemedRBSheetProps>((props, ref) => {
  const { children, customStyles = {} } = props;
  const sheetRef = useRef<RBSheet>(null);
  
  // Theme colors extraction using your custom hook
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');

  // Default styles with theme colors
  const defaultStyles = {
    wrapper: {
      backgroundColor: "rgba(0, 0, 0, 0.8)",
    },
    draggableIcon: {
      backgroundColor: "#000",
    },
    container: {
      backgroundColor: secondaryBackgroundColor,
      paddingHorizontal: 26,
    },
  };

  // Merge custom styles with default styles
  const mergedStyles = {
    ...defaultStyles,
    ...customStyles,
  };

  const defaultProps = {
    draggable: true,
    customStyles: mergedStyles,
    height: 400,
    ...props, // This spreads additional props last so they can override defaults
  };

  // Expose RBSheet methods to the parent component
  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.open(),
    close: () => sheetRef.current?.close(),
  }));

  return (
    <RBSheet
      ref={sheetRef}
      {...defaultProps}
    >
      <SafeAreaView style={styles.sheetContent}>
        {children}
      </SafeAreaView>
    </RBSheet>
  );
});

const styles = StyleSheet.create({
  sheetContent: {
    marginTop: 16, 
    flex: 1,
  },
});
