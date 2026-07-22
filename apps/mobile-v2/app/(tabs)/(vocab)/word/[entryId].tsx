import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function WordDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-xl font-bold text-foreground">Word Detail</Text>
      <Text className="text-muted-foreground mt-2">{entryId}</Text>
    </View>
  );
}
