// @/components/ProModal.tsx

import React from "react";
import { View, Modal, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { useNavigation } from '@react-navigation/native';

export const ProModal: React.FC = () => {
  const { showProModal, setShowProModal } = useVideoWithTranscriptContext();
  const navigation = useNavigation();

  const handleUpgrade = () => {
    setShowProModal(false);
    navigation.navigate('/go-pro');
  };

  return (
    <Modal
      transparent={true}
      visible={showProModal}
      onRequestClose={() => setShowProModal(false)}
    >
      <TouchableOpacity style={styles.modalBackground} onPress={() => setShowProModal(false)}>
        <View style={styles.modalContent}>
          <TouchableOpacity onPress={() => setShowProModal(false)} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
          <Text style={styles.modalText}>
            As a free user, you can only view the first ten lines from each video. To continue viewing, upgrade to Pro.
          </Text>
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalContent: {
    width: '80%',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButton: {
    alignSelf: 'flex-end',
  },
  closeButtonText: {
    fontSize: 20,
  },
  modalText: {
    fontSize: 16,
    marginVertical: 20,
    textAlign: 'center',
  },
  upgradeButton: {
    backgroundColor: '#6200EE',
    padding: 10,
    borderRadius: 5,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
  },
});
