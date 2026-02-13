import '@testing-library/jest-dom';
import { vi } from 'vitest';
import type { PropsWithChildren } from 'react';
// jsdom polyfill for matchMedia used by next-themes / Chakra
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Mock next-themes for tests to avoid accessing window.matchMedia
vi.mock('next-themes', () => {
  return {
    ThemeProvider: ({ children }: PropsWithChildren) => children,
    useTheme: () => ({
      resolvedTheme: 'light',
      setTheme: () => {},
      forcedTheme: undefined,
    }),
  };
});
