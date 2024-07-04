// @/components/ChatGPTExplanation.tsx

import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedButton } from "./ThemedButton";
import { ChatGPT } from "@/components/ChatGPT";
import { GradientLine } from "./GradientLine";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";
import { ProFeatureModal } from "@/components/ProFeatureModal";

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
      <ProFeatureModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        upgradeText="Only Pro users can use AI features in Language Player Go. To use this feature, upgrade to Pro."
      />
    </>
  );
};
