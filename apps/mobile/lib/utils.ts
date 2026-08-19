import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind/NativeWind class names, resolving conflicts so later classes
 * win (react-native-reusables `cn` pattern). Used by all `components/ui/*`
 * primitives so callsite overrides always beat the primitive's base styles.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
