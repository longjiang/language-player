import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ThemedInput';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const ThemedSearchableSelect = ({
  options,
  onSelect,
  placeholder,
  style,
  renderItem: customRenderItem,
  initialValue
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLabel, setSelectedLabel] = useState(initialValue?.label || ''); // Initialize with initialValue label
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const inputColor = useThemeColor({}, 'primaryBackground');
  const textColor = useThemeColor({}, 'primaryText');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');

  // Update selectedLabel when initialValue changes
  useEffect(() => {
    if (initialValue) {
      const initialItem = options.find(option => option.value == initialValue)

      if (initialItem) setSelectedLabel(initialItem.label);
    }
  }, [initialValue]);

  const filteredOptions = options.filter(option => option.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelect = (value, label) => {
    onSelect(value);
    setSelectedLabel(label); // Update the input field with the selected label
    setIsOpen(false); // Close the dropdown when an item is selected
  };

  const renderItemWrapper = ({ item }) => {
    const itemPress = () => handleSelect(item.value, item.label);
    if (customRenderItem) {
      // Pass all necessary props to the custom renderItem, along with the modified onPress
      return React.cloneElement(customRenderItem({ item }), { onPress: itemPress });
    }
    return (
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
    overflow: 'hidden', // Ensures that the content is clipped to the bounds of the list
  },
  item: {
    padding: 10,
  },
});
