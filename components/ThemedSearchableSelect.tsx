import React, { useState, useEffect, ReactElement } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ThemedInput';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export type Option = {
  value: string;
  label: string;
  flag?: string;
};

type ThemedSearchableSelectProps = {
  options: Option[];
  onSelect: (value: string) => void;
  placeholder: string;
  style?: object;
  renderItem?: (info: { item: Option }) => ReactElement;
  initialValue?: Option;
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
  const [selectedLabel, setSelectedLabel] = useState(initialValue?.label || '');
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const inputColor = useThemeColor({}, 'primaryBackground');
  const textColor = useThemeColor({}, 'primaryText');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');

  useEffect(() => {
    if (initialValue) {
      const initialItem = options.find(option => option.value === initialValue.value);
      if (initialItem) setSelectedLabel(initialItem.label);
    }
  }, [initialValue, options]);

  const filteredOptions = options.filter(option => option.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelect = (value: string, label: string) => {
    onSelect(value);
    setSelectedLabel(label);
    setIsOpen(false);
  };

  const renderItemWrapper = ({ item }: { item: Option }) => {
    const itemPress = () => handleSelect(item.value, item.label);
    return customRenderItem ? React.cloneElement(customRenderItem({ item }), { onPress: itemPress }) : (
      <TouchableOpacity style={styles.item} onPress={itemPress}>
        <ThemedText style={{ color: textColor }}>{item.label}</ThemedText>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <ThemedInput
      placeholder="Search..."
      value={searchTerm}
      onChangeText={setSearchTerm}
      style={{ backgroundColor: inputColor, borderColor, marginBottom: 8 }}
      icon="magnify"
    />
  );

  return (
    <TouchableWithoutFeedback onPress={() => isOpen && setIsOpen(false)}>
      <View style={[styles.container, { borderColor, backgroundColor }, style]}>
        <TouchableOpacity style={styles.input} onPress={() => setIsOpen(!isOpen)}>
          <ThemedText style={{ color: textColor }} variant="secondary">
            {selectedLabel || placeholder}
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
