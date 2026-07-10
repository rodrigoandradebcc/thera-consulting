import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { ItemsPage } from './ItemsPage';

const BASE = 'http://localhost:3000/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ItemsPage />
    </QueryClientProvider>,
  );
}

describe('ItemsPage', () => {
  it('exibe o preço formatado em BRL', async () => {
    server.use(
      http.get(`${BASE}/items`, () =>
        HttpResponse.json([
          { id: 'i1', sku: 'SKU-001', name: 'Palete', unitPrice: '129.90', active: true },
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText('R$ 129,90')).toBeInTheDocument();
  });

  it('envia unitPrice como string, não como número', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/items`, () => HttpResponse.json([])),
      http.post(`${BASE}/items`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: 'i2' }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /novo item/i }));
    await user.type(screen.getByLabelText('SKU'), 'SKU-002');
    await user.type(screen.getByLabelText('Nome'), 'Caixa');
    await user.type(screen.getByLabelText('Preço unitário'), '89.50');
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    expect(captured.mock.calls[0][0]).toEqual({ sku: 'SKU-002', name: 'Caixa', unitPrice: '89.50' });
  });

  it('rejeita preço com uma casa decimal e mostra o texto de ajuda de duas casas', async () => {
    server.use(http.get(`${BASE}/items`, () => HttpResponse.json([])));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /novo item/i }));
    await user.type(screen.getByLabelText('SKU'), 'SKU-003');
    await user.type(screen.getByLabelText('Nome'), 'Pallet');
    await user.type(screen.getByLabelText('Preço unitário'), '89.5');
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/duas casas decimais/i);
    expect(screen.getByText(/duas casas decimais, ex\.: 89\.50/i)).toBeInTheDocument();
  });
});
