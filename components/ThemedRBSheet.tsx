import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import RBSheet from 'react-native-raw-bottom-sheet';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";  // Assuming the hook is defined as seen in your file

const ThemedRBSheet = forwardRef(({ children, ...props }, ref) => {
  const sheetRef = useRef(null);
  
  // Theme colors extraction using your custom hook
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');

  // Default styles with theme colors
  const defaultStyles = {
    wrapper: {
      backgroundColor: "rgba(0, 0, 0, 0.8)",
    },
    draggableIcon: {
      backgroundColor: "#000"
    },
    container: {
      backgroundColor: secondaryBackgroundColor,
      paddingHorizontal: 26,
    },
  };

  // Merge custom styles with default styles
  const mergedStyles = {
    ...defaultStyles,
    ...props.customStyles,
  };

  const defaultProps = {
    closeOnDragDown: true,
    closeOnPressMask: true,
    customStyles: mergedStyles,
    height: 400,
    ...props, // This spreads additional props last so they can override defaults
  };

  // Expose RBSheet methods to the parent component
  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current.open(),
    close: () => sheetRef.current.close(),
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
    flex: 1,
  },
});

export default ThemedRBSheet;
