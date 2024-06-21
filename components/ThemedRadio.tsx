import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export const ThemedRadio = ({
  label,
  isSelected,
  onPress,
}) => {
  const checkedRadioColor = useThemeColor({}, 'primaryBrand');
  const uncheckedRadioColor = useThemeColor({}, 'secondaryBackground');
  const uncheckedBorderColor = useThemeColor({}, 'secondaryStroke');
  const checkedRadioFillColor = useThemeColor({}, 'primaryText');
  const textColor = useThemeColor({}, 'primaryText');

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.6}>
      <View style={[
        styles.radioCircle,
        { borderColor: isSelected ? checkedRadioColor : uncheckedBorderColor, backgroundColor: isSelected ? checkedRadioColor : uncheckedRadioColor}
      ]}>
        {isSelected && <View style={[
          styles.selectedCircle,
          { backgroundColor: checkedRadioFillColor }
        ]} />}
      </View>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  radioCircle: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selectedCircle: {
    height: 12,
    width: 12,
    borderRadius: 6,
  },
  label: {
    fontSize: 16,
  },
});
