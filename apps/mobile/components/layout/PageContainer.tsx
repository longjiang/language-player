import { View } from 'react-native';

interface PageContainerProps {
  children: React.ReactNode;
  /** Set to true for pages that benefit from full width (video, reader, EPUB). */
  fullWidth?: boolean;
}

/**
 * Wraps page content in a centered, max-width container.
 * Use as the inner wrapper inside a `<View className="flex-1 bg-background">`.
 *
 * On wide screens (iPad full-screen, landscape), content is capped at
 * `max-w-3xl` (768px) and centered, keeping text and grids readable.
 * On narrow screens, it renders as a plain flex container (no effect).
 */
export function PageContainer({ children, fullWidth = false }: PageContainerProps) {
  if (fullWidth) {
    return <>{children}</>;
  }
  return (
    <View className="flex-1 w-full max-w-3xl self-center">
      {children}
    </View>
  );
}
