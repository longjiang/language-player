// @/components/ThemedScreen.tsx

import React from 'react';
import { View, SafeAreaView, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CountryFlag from 'react-native-country-flag';
import { router } from "expo-router";
import { useLanguage } from '@/contexts/LanguageContext';
import { themedScreenStyles as styles } from '@/src/styles';
import { ClippedImage } from '@/components/ClippedImage';

const { width, height } = Dimensions.get('window');

export const ThemedScreen = ({
  title,
  titleParams = {}, // for translations with parameters
  children,
  onBackPress,
  showFlag = false,
  showHeader = true,
  imageHeight,
  onAction
}: {
  title: string,
  titleParams?: any,
  children: React.ReactNode,
  onBackPress?: () => void,
  showFlag?: boolean,
  showHeader?: boolean,
  imageHeight?: number,
  onAction?: () => void
}) => {
  const { languages, i18n, l2Lang } = useLanguage();
  const country = l2Lang ? languages?.getCountry(l2Lang) : null;
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
      <SafeAreaView>
        <View style={styles.contentContainer}>
          {(showHeader && <View style={styles.header}>
            <View style={styles.headerLeft}>
              {onBackPress && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={onBackPress} />}
              <ThemedText type="title" style={styles.title}>{i18n.t(title, titleParams)}</ThemedText>
            </View>
            {(onAction && <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="dots-horizontal-circle" />} onPress={onAction} />)}
            {(showFlag && <TouchableOpacity onPress={() => { router.navigate('/select-l2') }}>
              {(country &&<CountryFlag isoCode={country.alpha2Code} size={16} style={{ marginTop: 10, borderRadius: 3 }} />)}
            </TouchableOpacity>)}
          </View>)}
          {children}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
};