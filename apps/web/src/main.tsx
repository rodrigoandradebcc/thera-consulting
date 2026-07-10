import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from '@/components/ui/sonner';
import { applyTheme, resolveInitialTheme } from '@/lib/theme';
import { router } from '@/routes';
import './index.css';

// RouterProvider vem de 'react-router/dom', não de 'react-router'.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

// Aplicar antes do primeiro paint evita o flash de tema errado.
applyTheme(resolveInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
