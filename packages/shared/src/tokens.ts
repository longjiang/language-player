// ──────────────────────────────────────────────
// Shared Design Tokens
// Single source of truth for colors, typography, spacing, and
// border radius. Both web (Tailwind CSS) and mobile (NativeWind)
// consume these values.
//
// Canonical format: HSL for colors, rem for sizing.
// Mobile converts HSL → hex and rem → px via the helper functions.
// ──────────────────────────────────────────────

// ── Color Scales (HSL channels, space-separated: "H S% L%") ──
// Raw color palette. Components should use semantic tokens below,
// not these raw scales directly.

export const colors = {
  blue: {
    50: '214 100% 97%',
    100: '214 95% 93%',
    200: '214 90% 85%',
    300: '217 91% 75%',
    400: '224 82% 65%',
    500: '228 74% 59%', // ← primary
    600: '232 65% 52%',
    700: '235 58% 46%',
    800: '237 52% 40%',
    900: '239 47% 34%',
  },
  warm: {
    50: '30 100% 96%',
    100: '28 100% 90%',
    200: '27 100% 82%',
    300: '26 100% 74%',
    400: '25 100% 66%',
    500: '24 100% 62%', // ← accent
    600: '22 88% 55%',
    700: '20 76% 48%',
    800: '18 68% 42%',
    900: '16 60% 36%',
  },
  neutral: {
    50: '210 20% 98%',
    100: '210 17% 94%',
    200: '214 20% 85%',
    300: '215 14% 65%',
    400: '215 14% 46%',
    500: '222 47% 25%',
    600: '222 47% 18%',
    700: '222 47% 14%',
    800: '230 30% 10%',
    900: '230 30% 8%',
  },
  red: {
    50: '0 86% 97%',
    100: '0 93% 94%',
    200: '0 96% 89%',
    300: '0 94% 82%',
    400: '0 91% 71%',
    500: '0 84% 60%', // ← destructive
    600: '0 72% 51%',
    700: '0 74% 42%',
    800: '0 70% 35%',
    900: '0 63% 31%',
  },
  green: {
    50: '138 76% 97%',
    100: '141 84% 93%',
    200: '141 79% 85%',
    300: '142 77% 73%',
    400: '142 69% 58%',
    500: '142 71% 45%', // ← success
    600: '142 76% 36%',
    700: '142 72% 29%',
    800: '143 64% 24%',
    900: '144 61% 20%',
  },
  yellow: {
    50: '48 100% 96%',
    100: '48 96% 89%',
    200: '48 97% 77%',
    300: '46 97% 65%',
    400: '43 96% 56%',
    500: '38 92% 50%', // ← warning
    600: '32 95% 44%',
    700: '26 90% 37%',
    800: '23 83% 31%',
    900: '22 78% 26%',
  },
} as const;

// ── Semantic Color Tokens ────────────────────
// Components use these, not raw scales. Enables dark mode via swapping.

export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  input: string;
  ring: string;
}

export const lightSemantic: SemanticColors = {
  background: colors.neutral[50],
  foreground: colors.neutral[600],
  card: colors.neutral[50],
  cardForeground: colors.neutral[600],
  popover: colors.neutral[50],
  popoverForeground: colors.neutral[600],
  primary: colors.blue[500],
  primaryForeground: '0 0% 100%',
  secondary: colors.neutral[100],
  secondaryForeground: colors.neutral[600],
  muted: colors.neutral[100],
  mutedForeground: colors.neutral[400],
  accent: colors.warm[500],
  accentForeground: '0 0% 100%',
  destructive: colors.red[500],
  destructiveForeground: '0 0% 100%',
  success: colors.green[500],
  successForeground: '0 0% 100%',
  warning: colors.yellow[500],
  warningForeground: '0 0% 100%',
  border: colors.neutral[200],
  input: colors.neutral[200],
  ring: colors.blue[500],
};

export const darkSemantic: SemanticColors = {
  background: colors.neutral[900],
  foreground: colors.neutral[50],
  card: colors.neutral[800],
  cardForeground: colors.neutral[50],
  popover: colors.neutral[800],
  popoverForeground: colors.neutral[50],
  primary: colors.blue[400],
  primaryForeground: colors.neutral[900],
  secondary: colors.neutral[700],
  secondaryForeground: colors.neutral[50],
  muted: colors.neutral[700],
  mutedForeground: colors.neutral[300],
  accent: colors.warm[500],
  accentForeground: colors.neutral[900],
  destructive: '0 62% 50%',
  destructiveForeground: '0 0% 100%',
  success: '142 69% 40%',
  successForeground: '0 0% 100%',
  warning: '38 88% 45%',
  warningForeground: '0 0% 100%',
  border: colors.neutral[700],
  input: colors.neutral[700],
  ring: colors.blue[400],
};

// ── Typography ──────────────────────────────

export const typography = {
  fontFamily: {
    sans: 'Nunito',
    mono: 'JetBrains Mono',
  },
  fontSize: {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem', // 48px
  },
  fontWeight: {
    normal: '400',
    bold: '800',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

// ── Spacing (4px grid, rem units) ───────────

export const spacing = {
  0: '0',
  0.5: '0.125rem', // 2px
  1: '0.25rem', // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem', // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem', // 12px
  3.5: '0.875rem', // 14px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  12: '3rem', // 48px
  16: '4rem', // 64px
} as const;

// ── Border Radius ───────────────────────────

export const borderRadius = {
  none: '0',
  sm: '0.25rem', // 4px
  DEFAULT: '0.75rem', // 12px
  md: '0.75rem', // 12px
  lg: '1rem', // 16px
  xl: '1.5rem', // 24px
  full: '9999px',
} as const;

// ── Platform Adapters ───────────────────────

/**
 * Convert HSL channels ("H S% L%") → hex string for React Native.
 * Portable, no platform APIs needed.
 */
export function hslToHex(hsl: string): string {
  const parts = hsl.split(' ');
  const h = parseFloat(parts[0]!);
  const s = parseFloat(parts[1]!) / 100;
  const l = parseFloat(parts[2]!) / 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const toHex = (n: number) =>
    Math.round(255 * f(n))
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/** Build a StyleSheet-compatible color map from semantic tokens. */
export function semanticColorsForMobile(
  mode: 'light' | 'dark',
): Record<keyof SemanticColors, string> {
  const source = mode === 'light' ? lightSemantic : darkSemantic;
  const result: Record<string, string> = {};
  for (const [key, hsl] of Object.entries(source)) {
    result[key] = hslToHex(hsl as string);
  }
  return result as Record<keyof SemanticColors, string>;
}

/** Convert rem string → px number for React Native (1rem = 16px). */
export function remToPx(rem: string): number {
  return parseFloat(rem) * 16;
}

/** Build a font size record for React Native (px values). */
export function fontSizeForMobile(): Record<
  keyof typeof typography.fontSize,
  number
> {
  const result: Record<string, number> = {};
  for (const [key, rem] of Object.entries(typography.fontSize)) {
    result[key] = remToPx(rem);
  }
  return result as Record<keyof typeof typography.fontSize, number>;
}

/** Build a spacing record for React Native (px values). */
export function spacingForMobile(): Record<keyof typeof spacing, number> {
  const result: Record<string, number> = {};
  for (const [key, rem] of Object.entries(spacing)) {
    result[key] = remToPx(rem);
  }
  return result as Record<keyof typeof spacing, number>;
}

/** Build a border radius record for React Native (px values). */
export function borderRadiusForMobile(): Record<
  keyof typeof borderRadius,
  number
> {
  const result: Record<string, number> = {};
  for (const [key, rem] of Object.entries(borderRadius)) {
    if (rem === '9999px') {
      result[key] = 9999;
    } else {
      result[key] = remToPx(rem);
    }
  }
  return result as Record<keyof typeof borderRadius, number>;
}
