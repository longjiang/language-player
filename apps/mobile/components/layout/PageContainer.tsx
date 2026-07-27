import { View } from 'react-native';

interface PageContainerProps {
  children: React.ReactNode;
  /** Set to true for pages that benefit from full width (video, reader, EPUB). */
  fullWidth?: boolean;
  /** E2E test identifier forwarded to the outer native View. */
  testID?: string;
}

/**
 * Wraps page content in a full-screen background container with centered,
 * max-width content area.
 *
 * On wide screens (iPad full-screen, landscape), the inner content is capped
 * at `max-w-3xl` (768px) and centered, keeping text and grids readable.
 * On narrow screens, `max-w-3xl` and `self-center` have no effect — content
 * fills the screen naturally.
 *
 * For ScrollView-based screens, use a `<ScrollView className="flex-1">`
 * as a child — it fills the inner wrapper and scrolls independently.
 */
export function PageContainer({ children, fullWidth = false, testID }: PageContainerProps) {
  if (fullWidth) {
    return <View className="flex-1 bg-background" testID={testID}>{children}</View>;
  }
  return (
    <View className="flex-1 bg-background" testID={testID}>
      <View className="flex-1 w-full max-w-3xl self-center">
        {children}
      </View>
    </View>
  );
}
