import React, { useState, useEffect, ReactElement, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, TouchableWithoutFeedback, Keyboard } from 'react-native';
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
const { i18n } = useLanguage();

type ThemedSearchableSelectProps = {
  options: Option[];
  onSelect: (value: string) => void;
  placeholder: string;
  style?: object;
  renderItem?: (info: { item: Option }) => ReactElement;
  initialValue?: string;
};

export const ThemedSearchableSelect: React.FC<ThemedSearchableSelectProps> = ({
  options,
  onSelect,
  placeholder,
  style,
  renderItem: customRenderItem,
  initialValue
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const inputColor = useThemeColor({}, 'primaryBackground');
  const textColor = useThemeColor({}, 'primaryText');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');

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
  };

  const handleChangeText = useCallback((text: string) => {
    setSearchTerm(text);
  }, []);

  const renderItemWrapper = ({ item }: { item: Option }) => {
    const itemPress = () => handleSelect(item.value, item.label);
    return customRenderItem ? React.cloneElement(customRenderItem({ item }), { onPress: itemPress }) : (
      <TouchableOpacity style={styles.item} onPress={itemPress}>
        <ThemedText style={{ color: textColor }}>{item.label}</ThemedText>
      </TouchableOpacity>
    );
  };
  
  // Use useCallback to memoize the header component
  const renderHeader = useCallback(() => (
    <ThemedInput
    placeholder={placeholder}
    onChangeText={handleChangeText}
    style={{ backgroundColor: inputColor, borderColor, marginBottom: 8 }}
    icon="magnify"
  />
  ), []);

  return (
    <TouchableWithoutFeedback onPress={() => isOpen && setIsOpen(false)}>
      <View style={[styles.container, { borderColor, backgroundColor }, style]}>
        <TouchableOpacity style={styles.input} onPress={() => setIsOpen(!isOpen)}>
          <ThemedText style={{ color: textColor }} variant="secondary">
          {i18n.t(selectedLabel || placeholder, { missingBehavior: "guess"})}
          </ThemedText>
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={24} color={placeholderTextColor} />
        </TouchableOpacity>
        {isOpen && (
          <FlatList
            data={filteredOptions}
            renderItem={renderItemWrapper}
            keyExtractor={item => item.value}
            ListHeaderComponent={renderHeader}
            style={[styles.dropdown, { borderColor, backgroundColor, height: 300 }]}
          />
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
