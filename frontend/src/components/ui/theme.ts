import {
  createSystem,
  defaultConfig,
  defineConfig,
  defineTokens,
  defineSemanticTokens,
} from '@chakra-ui/react';

// Breakpoints (match Chakra/Panda defaults unless customized)
export const breakpoints = {
  base: '0rem',
  sm: '40rem',  // 640px
  md: '48rem',  // 768px
  lg: '64rem',  // 1024px
  xl: '80rem',  // 1280px
};

// Define design tokens (e.g., brand colors)
const tokens = defineTokens({
  colors: {
    sws: {
      primary: { value: '#0c7fef' },
      secondary: { value: '#ffffff' },
      selected: { value: '#18181B' },
    },
    // Example brand palette (tweak to your needs)
    brand: {
      50: { value: '#f0f9ff' },
      100: { value: '#e0f2fe' },
      200: { value: '#bae6fd' },
      300: { value: '#7dd3fc' },
      400: { value: '#5aaefb' },
      500: { value: '#1E90FF' }, // primary brand color (matches banner)
      600: { value: '#1c7ed6' },
      700: { value: '#0369a1' },
      800: { value: '#075985' },
      900: { value: '#0c4a6e' },
    },
    // Optionally map your logo color (e.g., #60a5fa) into a token
    logo: {
      400: { value: '#60a5fa' },
    },
  },
  // Spacing scale aliases for padding/gap etc.
  spacing: {
    xs: { value: '0.5rem' },   // 8px
    sm: { value: '0.75rem' },  // 12px
    md: { value: '1rem' },     // 16px
    lg: { value: '1.5rem' },   // 24px
    xl: { value: '2rem' },     // 32px
    '2xl': { value: '3rem' },    // 48px
    '3xl': { value: '4rem' },    // 64px
    '4xl': { value: '5rem' },    // 80px
    '5xl': { value: '6rem' },    // 96px
    '6xl': { value: '7rem' },    // 112px
    '7xl': { value: '8rem' },    // 128px
    '8xl': { value: '9rem' },    // 144px
    '9xl': { value: '10rem' },    // 160px
    '10xl': { value: '11rem' },    // 176px
  },
  // Border radius scale aliases
  radii: {
    xs: { value: '4px' },
    sm: { value: '6px' },
    md: { value: '8px' },
    lg: { value: '12px' },
    xl: { value: '15px' },
    '2xl': { value: '16px' },
    '3xl': { value: '20px' },
    full: { value: '999px' },
  },
});

// Define semantic tokens (map UI roles to tokens, with color mode support)
const semanticTokens = defineSemanticTokens({
  fontsize:{
  '4xs': { value: '9px' },
  '3xs': { value: '10px' },
  '2xs': { value: '11px' },
   xs: { value: '12px' },
   sm: { value: '14px' },
   md: { value: '16px' },
   lg: { value: '18px' },
   xl: { value: '20px' },
   '2xl': { value: '22px' },
   '3xl': { value: '24px' },
   '4xl': { value: '26px' },
   '5xl': { value: '28px' },
   '6xl': { value: '30px' },
   '7xl': { value: '32px' },
   '8xl': { value: '34px' },
   '9xl': { value: '36px' },
   '10xl': { value: '38px' },
  },
  responsive: {
    breakpoints: {
      sm: { value: '375px' },
      md: { value: '768px' },
      lg: { value: '1024px' },
      xl: { value: '1440px' },
      '2xl': { value: '1680px' },
    },
  },
  colors: {
    'text.title': {
      DEFAULT: { value: '#1F2733' },
      _dark: { value: '#FFFFFF' },
    },
    'text.subtitle': {
      DEFAULT: { value: '#A0AEC0' },
      _dark: { value: '#94a3b8' },
    },
    'text.content': {
      DEFAULT: { value: '#A0AEC0' },
      _dark: { value: '#64748b' },
    },
    // Backgrounds / foregrounds used throughout the app
    bg: {
      DEFAULT: { value: '#dbeafe' },  // light page background
      _dark: { value: '#1b254b' },    // dark page background
    },    
    'bg.subtle': {
      DEFAULT: { value: '#ffffff' },  // light cards/sidebar
      _dark: { value: '#111c44' },    // dark cards/sidebar
    },
    'bg.muted': {
      DEFAULT: { value: '#e2e8f0' },  // separators/active fill
      _dark: { value: '#0b1437' },    // dark active/hover bg
    },
    fg: {
      DEFAULT: { value: '#1b254b' },  // navy-ish foreground
      _dark: { value: '#d0dcfb' },    // dark foreground
    },
    // Primary accent color derived from brand
    primary: {
      DEFAULT: { value: '#155DFC' },
      _hover: { value: '#1c7ed6' },
      _active: { value: '#0369a1' },
      _disabled: { value: '#e2e8f0' },
    },
  },
});

// Compose our custom configuration on top of Chakra's default config
const appConfig = defineConfig({
  theme: {
    tokens,
    semanticTokens,
  },
  // Optional: conditions for multi-theme setups via data-theme on <html> or <body>
  conditions: {
    lightTheme: '[data-theme=light] &',
    darkTheme: '[data-theme=dark] &',
    minimalTheme: '[data-theme=minimal] &',
    contrastTheme: '[data-theme=contrast] &',
  },
});

// Build a System from the default config plus our overrides
export const system = createSystem(defaultConfig, appConfig);
export default system;