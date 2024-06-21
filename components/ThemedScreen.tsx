import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const ThemedScreen = ({
  title,
  children,
  onBackPress,
  imageName,
  imageStyle
}) => {
  return (
    <ThemedView style={styles.container}>
      {imageName && <Image source={imageName} style={[styles.image, imageStyle]} />}
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={onBackPress} />
          <ThemedText type="title" style={styles.title}>{title}</ThemedText>
        </View>
        {children}
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 26,
    textAlign: "left",
    width: "100%", // Full width container
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginLeft: -15,
  },
  title: {
    marginLeft: 10,
  },
  image: {
    width: "100%",
    marginBottom: 20,
  },
});
