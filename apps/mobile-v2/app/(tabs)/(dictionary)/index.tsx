import { View, Text } from 'react-native';
import { useT } from '@/hooks/use-t';

export default function DictionaryScreen() {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
      <Text className="text-muted-foreground mt-2">{t('msg.all_done_for_now')}</Text>
    </View>
  );
}
