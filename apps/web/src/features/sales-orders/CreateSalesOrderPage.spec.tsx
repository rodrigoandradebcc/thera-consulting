import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { CreateSalesOrderPage } from './CreateSalesOrderPage';

const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const TRANSPORT = '33333333-3333-4333-8333-333333333333';
const ITEM = '44444444-4444-4444-8444-444444444444';
const BASE = 'http://localhost:3000/api';

function renderPage() {
  server.use(
    http.get(`${BASE}/customers`, () =>
      HttpResponse.json([
        { id: CUSTOMER, name: 'ACME', document: '1', email: null, active: true, createdAt: '' },
      ]),
    ),
    http.get(`${BASE}/transport-types`, () =>
      HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
    ),
    http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () =>
      HttpResponse.json({ transportTypeIds: [TRANSPORT] }),
    ),
    http.get(`${BASE}/items`, () =>
      HttpResponse.json([
        { id: ITEM, sku: 'SKU-001', name: 'Palete', unitPrice: '129.90', active: true },
      ]),
    ),
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <CreateSalesOrderPage /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('CreateSalesOrderPage', () => {
  it('mantém o transporte desabilitado até um cliente ser escolhido, com explicação', async () => {
    renderPage();

    expect(await screen.findByLabelText('Tipo de transporte')).toBeDisabled();
    expect(screen.getByText(/selecione um cliente/i)).toBeInTheDocument();
  });

  it('envia a OV sem o campo total', async () => {
    const captured = vi.fn();
    server.use(
      http.post(`${BASE}/sales-orders`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: 'novo' }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Cliente'), CUSTOMER);
    await waitFor(() => expect(screen.getByLabelText('Tipo de transporte')).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Tipo de transporte'), TRANSPORT);
    await user.selectOptions(screen.getByLabelText('Item 1'), ITEM);
    await user.clear(screen.getByLabelText('Quantidade 1'));
    await user.type(screen.getByLabelText('Quantidade 1'), '2');
    await user.click(screen.getByRole('button', { name: /criar ordem de venda/i }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    const body = captured.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('total');
    expect(body.items).toEqual([{ itemId: ITEM, quantity: 2 }]);
  });
});
