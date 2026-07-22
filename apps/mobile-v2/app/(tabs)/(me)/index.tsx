import { View, Text, Pressable } from 'react-native';
import { useT } from '@/hooks/use-t';
import { useAuth } from '@/contexts/AuthContext';

export default function MeScreen() {
  const t = useT();
  const { user, logout } = useAuth();

  return (
    <View className="flex-1 bg-background p-4">
      <Text className="text-xl font-bold text-foreground">{t('tab.me')}</Text>
      {user && (
        <Text className="text-muted-foreground mt-2">{user.email}</Text>
      )}
      <Pressable
        className="mt-4 bg-destructive px-4 py-2 rounded-lg"
        onPress={logout}
      >
        <Text className="text-destructive-foreground font-bold">
          {t('action.logout')}
        </Text>
      </Pressable>
    </View>
  );
}
