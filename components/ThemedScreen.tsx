import React from 'react';
import { View, SafeAreaProvider, SafeAreaView, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CountryFlag from 'react-native-country-flag';

export const ThemedScreen = ({
  title,
  children,
  onBackPress,
  imageName,
  imageStyle,
  showFlag
}: {
  title: string,
  children: React.ReactNode,
  onBackPress?: () => void,
  imageName?: any,
  imageStyle?: any
  showFlag?: boolean
}) => {
  return (
    <ThemedView style={styles.container}>
      {imageName && <Image source={imageName} style={[styles.image, imageStyle]} />}
      <SafeAreaView>
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {onBackPress && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={onBackPress} />}
              <ThemedText type="title" style={styles.title}>{title}</ThemedText>
            </View>
            {(showFlag && <TouchableOpacity onPress={() => { router.navigate('/select-l2') }}>
              <CountryFlag isoCode="cn" size={16} style={{ marginTop: 10, borderRadius: 3 }} />
            </TouchableOpacity>)}
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
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: 'row',
  },
  title: {
    marginLeft: 10,
  },
  image: {
    width: "100%",
    marginBottom: 20,
  },
});
