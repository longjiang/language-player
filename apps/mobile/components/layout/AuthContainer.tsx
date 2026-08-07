import { View } from 'react-native';

/**
 * Centered auth form container — mirrors apps/web's `max-w-md` card wrapper
 * (SPEC-052 Phase 6).
 */
export function AuthContainer({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 justify-center bg-background p-6">
      <View className="w-full self-center" style={{ maxWidth: 448 }}>
        {children}
      </View>
    </View>
  );
}
