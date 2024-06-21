import React from 'react';
import { View, SafeAreaProvider, SafeAreaView, StyleSheet, Image, TouchableOpacity } from 'react-native';
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
}: {
  title: string,
  children: React.ReactNode,
  onBackPress?: () => void,
  imageName?: any,
  imageStyle?: any
}) => {
  return (
    <ThemedView style={styles.container}>
      {imageName && <Image source={imageName} style={[styles.image, imageStyle]} />}
      <SafeAreaView>
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            {onBackPress && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={onBackPress} />}
            <ThemedText type="title" style={styles.title}>{title}</ThemedText>
          </View>
          {children}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  contentContainer: {
    padding: 26,
    textAlign: "left",
    width: "100%", // Full width container
  },
  header: {
    flexDirection: 'row',
    marginBottom: 20,
    marginLeft: -15,
    alignItems: "flex-start",
  },
  title: {
    marginLeft: 10,
  },
  image: {
    width: "100%",
    marginBottom: 20,
  },
});
