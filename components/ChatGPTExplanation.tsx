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
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { subscriptionIsActive, subscription } = useSubscription();
  const [modalVisible, setModalVisible] = useState(false);
  const { t } = useLanguage();

  const handlePress = () => {
    if (subscriptionIsActive(subscription)) {
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
          style={{ marginBottom: 20, width: '100%'}}
          title={t('action.let_chatgpt_explain')}
          onPress={handlePress}
          size="medium"
        />
      )}
      {showChatGPT && (
        <View style={{ marginBottom: 16, width: '100%' }}>
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
        upgradeText={t('msg.pro_feature_chatgpt')}
      />
    </>
  );
};