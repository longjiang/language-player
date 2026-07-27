/**
 * E2E test identifier helper for Maestro.
 *
 * Returns a `testID` prop object only in dev/test builds.
 * Stripped from production bundles by Metro dead-code elimination
 * when `__DEV__` is false.
 *
 * Usage:
 *   <TextInput {...e2e('login-email-input')} />
 *   <Pressable {...e2e('login-signin-button')} />
 */
export function e2e(id: string): { testID?: string } {
  return __DEV__ ? { testID: id } : {};
}
