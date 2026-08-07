import { View } from 'react-native';

const PAGE_MAX_WIDTHS = {
  '2xl': 672,
  '3xl': 768,
  '4xl': 896,
  '5xl': 1024,
  '7xl': 1280,
} as const;

export type PageMaxWidth = keyof typeof PAGE_MAX_WIDTHS | 'full';

interface PageContainerProps {
  children: React.ReactNode;
  /** Set to true for pages that benefit from full width (video, reader, EPUB). */
  fullWidth?: boolean;
  /**
   * Content cap, mirroring apps/web page containers:
   * `2xl` 672 · `3xl` 768 · `4xl` 896 · `5xl` 1024 · `7xl` 1280.
   * Defaults to `3xl` for backwards compatibility.
   */
  maxWidth?: PageMaxWidth;
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
export function PageContainer({ children, fullWidth = false, maxWidth = '3xl', testID }: PageContainerProps) {
  if (fullWidth) {
    return <View className="flex-1 bg-background" testID={testID}>{children}</View>;
  }
  return (
    <View className="flex-1 bg-background" testID={testID}>
      <View
        className="flex-1 w-full self-center"
        style={maxWidth !== 'full' ? { maxWidth: PAGE_MAX_WIDTHS[maxWidth] } : undefined}
      >
        {children}
      </View>
    </View>
  );
}
