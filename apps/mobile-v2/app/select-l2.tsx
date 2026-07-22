import { View, Text, Pressable, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { SUPPORTED_L2S } from '@langplayer/shared';

export default function SelectL2Screen() {
  const t = useT();
  const { setL2Lang } = useLanguage();
  const languages = [...SUPPORTED_L2S];

  const handleSelect = async (code: string) => {
    await setL2Lang(code);
    router.replace('/(tabs)');
  };

  return (
    <View className="flex-1 bg-background p-6">
      <Text className="text-2xl font-bold text-foreground mb-6">
        {t('title.choose_language')}
      </Text>
      <Text className="text-muted-foreground mb-4">
        {t('msg.choose_target_language')}
      </Text>

      <FlatList
        data={languages}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <Pressable
            className="bg-card border border-border rounded-lg px-4 py-3 mb-2"
            onPress={() => handleSelect(item)}
          >
            <Text className="text-foreground text-base">{item}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
