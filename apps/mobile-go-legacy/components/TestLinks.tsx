import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

const routes = [
  '/',
  '/account',
  '/acquisition-survey',
  '/delete-account',
  '/go-pro',
  '/login',
  '/privacy-policy',
  '/register',
  '/select-l1',
  '/select-l2',
  '/select-level',
  '/settings',
  '/verify-email',
  '/(tabs)',
  '/dictionary',
  '/(tabs)/(me)',
  '/(tabs)/(me)/index',
  '/(tabs)/(me)/saved-words',
  '/(tabs)/(me)/watch-history',
  '/(tabs)/(media)',
  '/(tabs)/(media)/index',
  '/(tabs)/(media)/search',
  '/(tabs)/(media)/tv-shows',
];

export const TestLinks = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.linkContainer}>
        {routes.map((route) => (
          <Link key={route} href={route} style={styles.link}>
            {route}
          </Link>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  linkContainer: {
    padding: 16,
  },
  link: {
    fontSize: 16,
    color: '#007AFF',
    marginBottom: 12,
  },
});