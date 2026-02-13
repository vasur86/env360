import { render, screen } from '@testing-library/react';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ChakraProvider } from '@/components/ui/provider';

describe('App', () => {
  it('renders home page heading', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ChakraProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ChakraProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: /env360/i })).toBeInTheDocument();
  });
});
