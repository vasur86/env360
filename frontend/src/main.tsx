import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from './components/ui/provider';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './app/ErrorBoundary';

if (import.meta.env.DEV) {
  // Lazy-load dev-only accessibility checks
  import('./devtools/accessibility');
}

// Suppress browser extension errors (password managers, form autofill, etc.)
// These errors come from extensions trying to interact with custom form components
// and don't affect application functionality
window.addEventListener('error', (event) => {
  // Suppress errors from browser extension content scripts
  if (
    event.filename?.includes('content_script') ||
    event.message?.includes('Cannot read properties of undefined') ||
    event.message?.includes("reading 'control'")
  ) {
    event.preventDefault();
    return false;
  }
}, true);

// Also suppress unhandled promise rejections from extensions
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.message?.includes('Cannot read properties of undefined') ||
    event.reason?.message?.includes("reading 'control'")
  ) {
    event.preventDefault();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Consider data fresh for 30 seconds
      gcTime: 300000, // Keep in cache for 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: true, // Refetch on mount if data is stale (e.g. after create/update)
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider>
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
);
