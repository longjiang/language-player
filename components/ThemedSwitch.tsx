import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

const CustomSwitch = ({ isEnabled, toggleSwitch }) => {
  // Retrieve theme colors
  const primaryBrandColor = useThemeColor({}, 'primaryBrand');
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke'); // Corrected variable name
  const primaryTextColor = useThemeColor({}, 'primaryText');

  return (
    <TouchableOpacity
      onPress={toggleSwitch}
      style={[styles.container, {
        backgroundColor: isEnabled ? primaryBrandColor : secondaryBackgroundColor,
        borderColor: secondaryStrokeColor, // Apply stroke color as border
      }]}
    >
      <View
        style={[styles.thumb, {
          backgroundColor: primaryTextColor,
          borderColor: secondaryStrokeColor, // Apply stroke color as border
          alignSelf: isEnabled ? 'flex-end' : 'flex-start',
        }]}
      />
    </TouchableOpacity>
  );
};

// Updated styling for the switch
const styles = StyleSheet.create({
  container: {
    width: 35,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
    borderWidth: 1, // Added border width
  },
  thumb: {
    height: 16,
    width: 16,
    borderRadius: 8,
    borderWidth: 1, // Added border width
    transition: 'all 0.3s ease', // Note: Transition is for web. React Native doesn't support this out of the box.
  },
});

export default CustomSwitch;
