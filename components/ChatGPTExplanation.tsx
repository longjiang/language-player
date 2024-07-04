// @/components/ChatGPTExplanation.tsx

import React from "react";
import { View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedButton } from "./ThemedButton";
import { ChatGPT } from "@/components/ChatGPT";
import { GradientLine } from "./GradientLine";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";

interface ChatGPTExplanationProps {
  showChatGPT: boolean;
  chatGPTPrompt: string;
  onExplainPress: () => void;
}

export const ChatGPTExplanation: React.FC<ChatGPTExplanationProps> = ({ showChatGPT, chatGPTPrompt, onExplainPress }) => {
  return (
    <>
      {!showChatGPT && (
        <ThemedButton
          type="pro"
          style={{ marginBottom: 26 }}
          title="Let ChatGPT Explain"
          onPress={onExplainPress}
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
    </>
  );
};
