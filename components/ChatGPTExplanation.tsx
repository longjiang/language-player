// @/components/ChatGPTExplanation.tsx

import React, { useState } from "react";
import { View, Modal, Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { ThemedButton } from "./ThemedButton";
import { ChatGPT } from "@/components/ChatGPT";
import { GradientLine } from "./GradientLine";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";

interface ChatGPTExplanationProps {
  showChatGPT: boolean;
  chatGPTPrompt: string;
  onExplainPress: () => void;
}

export const ChatGPTExplanation: React.FC<ChatGPTExplanationProps> = ({
  showChatGPT,
  chatGPTPrompt,
  onExplainPress,
}) => {
  const { isProUser } = useSubscription();
  const [modalVisible, setModalVisible] = useState(false);

  const handlePress = () => {
    if (isProUser()) {
      onExplainPress();
    } else {
      setModalVisible(true);
    }
  };

  const handleUpgrade = () => {
    setModalVisible(false);
    router.navigate("/go-pro");
  };

  return (
    <>
      {!showChatGPT && (
        <ThemedButton
          type="pro"
          style={{ marginBottom: 26 }}
          title="Let ChatGPT Explain"
          onPress={handlePress}
          leadingIcon={
            <Icon name="chat-outline" size={20} style={styles.iconStyle} />
          }
        />
      )}
      {showChatGPT && (
        <View style={{ marginBottom: 16 }}>
          <GradientLine />
          <View style={{ marginVertical: 10 }}>
            <ChatGPT prompt={chatGPTPrompt} />
          </View>
          <GradientLine />
        </View>
      )}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={modalStyles.modalBackground}
          activeOpacity={1}
          onPressOut={() => setModalVisible(false)}
        >
          <View style={modalStyles.modalContainer}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Icon name="close" size={30} style={modalStyles.modalCloseIcon} />
            </TouchableOpacity>
            <Text style={modalStyles.modalTitle}>Pro Feature</Text>
            <Text style={modalStyles.modalText}>
              Only Pro users can use AI features in Language Player Go. To use
              this feature, upgrade to Pro.
            </Text>
            <TouchableOpacity
              style={modalStyles.upgradeButton}
              onPress={handleUpgrade}
            >
              <Text style={modalStyles.upgradeButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

// styles.ts

import { StyleSheet } from "react-native";

export const modalStyles = StyleSheet.create({
  iconStyle: {
    color: "#fff",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  modalContainer: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  modalCloseIcon: {
    alignSelf: "flex-end",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  upgradeButton: {
    backgroundColor: "#6200EE",
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  upgradeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
});
