// @/components/ThemedSearchableSelect

import React, { useState, useEffect, ReactElement, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ThemedInput';
import { useLanguage } from '@/contexts/LanguageContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export type Option = {
  value: string;
  label: string; // The translation string key
  translatedLabel?: string; // The translated label
  englishLabel?: string; // The English label
  alternateLabel?: string; // In language select, this is the vernacular name of the language
  flag?: string; // Flag emoji
  icon?: string; // Circular png icon
  [key: string]: any; // Index signature to allow accessing properties using a string index
};

type ThemedSearchableSelectProps = {
  options: Option[];
  onSelect: (value: string) => void;
  placeholder: string;
  style?: object;
  renderItem?: (info: { item: Option }) => ReactElement;
  initialValue?: string;
  onFocus?: () => void; // Add onFocus prop
  onBlur?: () => void; // Add onBlur prop
};

export const ThemedSearchableSelect: React.FC<ThemedSearchableSelectProps> = ({
  options,
  onSelect,
  placeholder,
  style,
  renderItem: customRenderItem,
  initialValue,
  onFocus, // Destructure onFocus prop
  onBlur // Destructure onBlur prop
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const borderColor = useThemeColor({}, 'secondaryBackground');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const inputColor = useThemeColor({}, 'primaryBackground');
  const textColor = useThemeColor({}, 'primaryText');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');

  const t = useT();

  useEffect(() => {
    if (initialValue) {
      const initialItem = options.find(option => option.value === initialValue);
      if (initialItem) setSelectedLabel(initialItem.label);
    }
  }, [initialValue, options]);

  const filter = (option: Option) => {
    for (let key in option) {
      if (typeof option[key] === 'string') {
        if (option[key].toLowerCase().includes(searchTerm.toLowerCase())) {
          return true;
        }
      }
    }
  }

  const filteredOptions = options.filter(filter);

  const handleSelect = (value: string, label: string) => {
    onSelect(value);
    setSelectedLabel(label);
    setIsOpen(false);
    if (onBlur) {
      onBlur(); // Call onBlur when an option is selected
    }
  };

  const handleChangeText = useCallback((text: string) => {
    setSearchTerm(text);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    if (onFocus) {
      onFocus(); // Call onFocus when the dropdown opens
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onBlur) {
      onBlur(); // Call onBlur when the dropdown closes
    }
  };

  const renderItemWrapper = ({ item }: { item: Option }) => {
    const itemPress = () => handleSelect(item.value, item.label);
    return customRenderItem ? React.cloneElement(customRenderItem({ item }), { onPress: itemPress }) : (
      <TouchableOpacity style={styles.item} onPress={itemPress}>
        <ThemedText style={{ color: textColor }}>{item.label}</ThemedText>
      </TouchableOpacity>
    );
  };
  
  const renderHeader = useCallback(() => (
    <ThemedInput
      placeholder={placeholder}
      onChangeText={handleChangeText}
      style={{ backgroundColor: inputColor, borderColor, marginBottom: 8 }}
      icon="magnify"
      size="small"
    />
  ), []);

  return (
    <TouchableWithoutFeedback onPress={() => isOpen && handleClose()}>
      <View style={[styles.container, { borderColor, backgroundColor }, style]}>
        <TouchableOpacity style={styles.input} onPress={() => isOpen ? handleClose() : handleOpen()}>
          <ThemedText style={{ color: textColor }} variant="secondary">
            {t(selectedLabel || placeholder)}
          </ThemedText>
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={24} color={placeholderTextColor} />
        </TouchableOpacity>
        {isOpen && (
          <ScrollView
            nestedScrollEnabled={true}
            style={[styles.dropdown, { borderColor, backgroundColor, height: 300 }]}>
            {renderHeader()}
            {filteredOptions.map((item, index) => (
              <View key={item.value || index}>
                {renderItemWrapper({ item })}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    zIndex: 1000,
  },
  input: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdown: {
    position: 'absolute',
    borderWidth: 1,
    top: 48 + 8, // input height + gap
    width: '100%',
    padding: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  item: {
    padding: 10,
  },
});
