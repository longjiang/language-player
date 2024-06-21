import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ThemedInput';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const ThemedSearchableSelect = ({
  options,
  onSelect,
  placeholder,
  style,
  renderItem,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const inputColor = useThemeColor({}, 'primaryBackground');
  const textColor = useThemeColor({}, 'primaryText');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');

  const filteredOptions = options.filter(option => option.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const defaultRenderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => onSelect(item.value)}>
      <ThemedText style={{ color: textColor }}>{item.label}</ThemedText>
    </TouchableOpacity>
  );

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
    <View style={[styles.container, { borderColor, backgroundColor }, style]}>
      <TouchableOpacity style={styles.input} onPress={() => setIsOpen(!isOpen)}>
        <ThemedText style={{ color: textColor }} variant="secondary">{placeholder}</ThemedText>
        <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={24} color={placeholderTextColor} />
      </TouchableOpacity>
      {isOpen && (
        <FlatList
          data={filteredOptions}
          renderItem={renderItem || defaultRenderItem}
          keyExtractor={item => item.value}
          ListHeaderComponent={renderHeader}
          style={[styles.dropdown, { borderColor, backgroundColor, maxHeight: 350 }]} // Set the height to 500px
        />
      )}
    </View>
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
