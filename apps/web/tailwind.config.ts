import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.ts',
    '../../packages/utils/src/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          50: '#f6edfa',
          100: '#ecdbf5',
          200: '#d9b7eb',
          300: '#c493e0',
          400: '#a06ad0',
          500: '#7d2fba',
          600: '#69279c',
          700: '#55207e',
          800: '#411861',
          900: '#2d1143',
        },
        warm: {
          50: '#fff4e6',
          100: '#ffe8cc',
          200: '#ffd8a8',
          300: '#ffc078',
          400: '#ffa94d',
          500: '#ff922b',
          600: '#fd7e14',
          700: '#f76707',
          800: '#e8590c',
          900: '#d9480f',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f1f3f5',
          dark: '#0B0D18',
          'dark-secondary': '#1a1d2e',
          'dark-tertiary': '#252840',
        },
      },
      fontFamily: {
        // The UI family is selected from the active L1 by the language
        // providers. Do not put JP/SC/TC faces in one fallback list: the
        // first installed face that contains Han wins, regardless of lang.
        sans: ['var(--lp-ui-font-family, var(--font-inter))', 'system-ui', 'sans-serif'],
        // Tailwind's default serif stack. CJK serif faces are NOT listed
        // here — merging per-script stacks into one class would let one
        // language's Han face win for every language (see the sans comment).
        // Tokenized-text containers carry a lang tag, and the globals.css
        // `.font-serif[lang]` rules resolve the correct per-script serif
        // stack for them.
        serif: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
};

export default config;
