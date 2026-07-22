// @/components/ContextRow.tsx

import React from "react";
import { useT } from '@/hooks/use-t';
import { View, TouchableOpacity, Platform, ActionSheetIOS, Alert, Clipboard } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";
import { speakText } from "@/src/speech";
import { useLanguage } from "@/contexts/LanguageContext";

interface ContextRowProps {
  context: string;
  translatedContext?: string;
  translation?: string;
}

export const ContextRow: React.FC<ContextRowProps> = ({ context, translatedContext, translation }) => {
  const t = useT();
  const { l2Lang } = useLanguage();

  const handleMenuPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('action.cancel'), t('action.copy'), t('action.speak')],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            Clipboard.setString(context);
          } else if (buttonIndex === 2) {
            speakText(context, l2Lang.code);
          }
        }
      );
    } else {
      Alert.alert(
        t('msg.options'),
        t('msg.choose_action'),
        [
          { text: t('action.cancel'), style: 'cancel' },
          { 
            text: t('action.copy'), 
            onPress: () => Clipboard.setString(context)
          },
          { 
            text: t('action.speak'), 
            onPress: () => speakText(context, l2Lang.code)
          },
        ]
      );
    }
  };

  return (
    <View style={styles.contextRow}>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.contextText} type="large">
          {context}
        </ThemedText>
        <ThemedText style={styles.translatedContextText} variant="secondary">
          {translatedContext || translation}
        </ThemedText>
      </View>
      <ThemedButton
        type="ghost"
        trailingIcon={<Icon name="dots-vertical" size={20} />}
        onPress={handleMenuPress}
      />
    </View>
  );
};