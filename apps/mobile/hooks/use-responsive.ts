import { useWindowDimensions } from 'react-native';
import { SM_BREAKPOINT, MD_BREAKPOINT, LG_BREAKPOINT, XL_BREAKPOINT } from '@/lib/constants';

/**
 * Shared responsive breakpoint hook — mirrors Tailwind's sm/md/lg/xl model
 * used by apps/web (SPEC-052 Phase 1).
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return {
    width,
    height,
    isSm: width >= SM_BREAKPOINT,
    isMd: width >= MD_BREAKPOINT,
    isLg: width >= LG_BREAKPOINT,
    isXl: width >= XL_BREAKPOINT,
  };
}
