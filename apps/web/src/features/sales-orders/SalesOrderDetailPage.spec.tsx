import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw-server';
import { salesOrderFixture } from '@/test/handlers';
import { SalesOrderDetailPage } from './SalesOrderDetailPage';

const BASE = 'http://localhost:3000/api';
const ORDER_ID = salesOrderFixture.id;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/sales-orders/:id', element: <SalesOrderDetailPage /> }], {
    initialEntries: [`/sales-orders/${ORDER_ID}`],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('SalesOrderDetailPage', () => {
  it('mostra o estado vazio de "não encontrada" para 404, sem botão de repetir', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/:id`, () =>
        HttpResponse.json({ statusCode: 404, error: 'NotFound', message: 'OV não encontrada.' }, { status: 404 })),
    );
    renderPage();

    expect(await screen.findByText(/ordem de venda não encontrada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para a lista/i })).toHaveAttribute('href', '/sales-orders');
  });

  it('mostra ErrorState com retry para outros erros (ex.: 500)', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/:id`, () =>
        HttpResponse.json({ statusCode: 500, error: 'InternalError', message: 'Falha interna.' }, { status: 500 })),
    );
    renderPage();

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText(/ordem de venda não encontrada/i)).not.toBeInTheDocument();
  });
});
