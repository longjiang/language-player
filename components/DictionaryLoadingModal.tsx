// @/components/DictionaryLoadingModal.js

import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';

export const DictionaryLoadingModal = () => {
  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={true}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.loadingText}>Loading Dictionary...</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 5,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
