import { View, Text } from 'react-native';
import { useT } from '@/hooks/use-t';

export default function ReviewScreen() {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-xl font-bold text-foreground">{t('title.review')}</Text>
    </View>
  );
}
