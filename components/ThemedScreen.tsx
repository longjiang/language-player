// @/components/ThemedScreen.tsx

import React from 'react';
import { View, SafeAreaView, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CountryFlag from 'react-native-country-flag';
import { router } from "expo-router";
import { useLanguage } from '@/contexts/LanguageContext';
import { themedScreenStyles as styles } from '@/src/styles';

export const ThemedScreen = ({
  title,
  titleParams = {}, // for translations with parameters
  children,
  onBackPress,
  imageName,
  imageStyle,
  showFlag,
  showHeader = true,
  onAction
}: {
  title: string,
  titleParams: any,
  children: React.ReactNode,
  onBackPress?: () => void,
  imageName?: any,
  imageStyle?: any,
  showFlag?: boolean,
  showHeader?: boolean,
  onAction?: () => void
}) => {
  const { languages, i18n, l2Lang } = useLanguage();
  const country = l2Lang ? languages?.getCountry(l2Lang) : null;
  return (
    <ThemedView style={styles.container}>
      {imageName && <Image source={imageName} style={[styles.image, imageStyle]} />}
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