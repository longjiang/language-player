import React from 'react';
import { TouchableOpacity, Image, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

export interface LanguageIconProps {
  icon: any;  // Accept any type for flexibility
  label: string;
  onPress: () => void;
  selected: boolean;
}

export const LanguageIcon: React.FC<LanguageIconProps> = ({ icon, label, onPress, selected }) => {
  const selectedColor = useThemeColor({}, 'secondaryBrand');
  const primaryTextColor = useThemeColor({}, 'primaryText');

  // Check if icon is a string and assume it's a URL
  const imageSource = typeof icon === 'string' ? { uri: icon } : icon;

  return (
    <TouchableOpacity style={styles.iconContainer} onPress={onPress}>
      <Image 
        source={imageSource} 
        style={[
          styles.iconImage,
          selected ? { borderColor: selectedColor, borderWidth: 5 } : null  // Apply the selected style if the icon is selected
        ]}
      />
      <ThemedText style={{marginTop: 16, color: selected ? selectedColor : primaryTextColor}} type="defaultBold">{label}</ThemedText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 32,
  },
  iconImage: {
    width: 67,
    height: 67,
    borderRadius: 33.5,  // half of width and height for perfect circle
  },
});
