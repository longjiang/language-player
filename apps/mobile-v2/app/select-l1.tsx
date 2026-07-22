import { View, Text, Pressable, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';

export default function SelectL1Screen() {
  const t = useT();
  const { availableL1s, setL1Lang } = useLanguage();

  const handleSelect = async (code: string) => {
    await setL1Lang(code);
    router.replace('/select-l2');
  };

  return (
    <View className="flex-1 bg-background p-6">
      <Text className="text-2xl font-bold text-foreground mb-6">
        {t('title.select_language')}
      </Text>
      <Text className="text-muted-foreground mb-4">
        {t('msg.choose_native_language')}
      </Text>

      <FlatList
        data={availableL1s}
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
