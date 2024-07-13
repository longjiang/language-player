import React from 'react';
import { View, SafeAreaView, StyleSheet, Image, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CountryFlag from 'react-native-country-flag';
import { router } from "expo-router";
import { useLanguage } from '@/contexts/LanguageContext';
import { ClippedImage } from '@/components/ClippedImage';

const { width, height } = Dimensions.get('window');

export const ThemedScreen = ({
  title,
  titleParams = {},
  children,
  onBackPress,
  showFlag = false,
  showHeader = true,
  imageHeight,
  onAction,
  scroll = true
}: {
  title: string,
  titleParams?: any,
  children: React.ReactNode,
  onBackPress?: () => void,
  showFlag?: boolean,
  showHeader?: boolean,
  imageHeight?: number,
  onAction?: () => void,
  scroll?: boolean
}) => {
  const { languages, i18n, l2Lang } = useLanguage();
  const country = l2Lang ? languages?.getCountry(l2Lang) : null;

  const ContentWrapper = scroll ? ScrollView : View;

  return (
    <ThemedView style={styles.container}>
      {imageHeight && <ClippedImage
        source={require("../assets/images/splash-image.png")}
        width={width}
        height={imageHeight}
        verticalAlign='bottom'
        horizontalAlign='center'
        resizeMode='cover'
        aspectRatio={0.59371}
      />}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contentContainer}>
          {showHeader && (
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {onBackPress && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={onBackPress} />}
                <ThemedText type="title" style={styles.title}>{i18n.t(title, titleParams)}</ThemedText>
              </View>
              {onAction && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="dots-horizontal-circle" />} onPress={onAction} />}
              {showFlag && (
                <TouchableOpacity onPress={() => { router.navigate('/select-l2') }}>
                  {country && <CountryFlag isoCode={country.alpha2Code} size={16} style={{ marginTop: 10, borderRadius: 3 }} />}
                </TouchableOpacity>
              )}
            </View>
          )}
          <ContentWrapper contentContainerStyle={scroll ? styles.scrollContent : styles.content}>
            {children}
          </ContentWrapper>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 26,
    width: "100%",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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