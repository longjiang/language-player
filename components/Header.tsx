// @/components/Header.tsx

import React from 'react';
import { SafeAreaView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicon from 'react-native-vector-icons/Ionicons';
import { ThemedButton } from './ThemedButton';
import { videoWithTranscriptStyles as styles } from '@/src/styles';

interface HeaderProps {
  minimizePlayer: () => void;
  openQueueSheet: () => void;
}

export const Header: React.FC<HeaderProps> = ({ minimizePlayer, openQueueSheet }) => {
  return (
    <SafeAreaView>
      <View style={styles.header}>
        <View>
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="chevron-down" />}
            onPress={minimizePlayer}
          />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="list" />}
            onPress={openQueueSheet}
          />
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="cog" />}
            onPress={() => {
              minimizePlayer();
              router.navigate('/settings');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};