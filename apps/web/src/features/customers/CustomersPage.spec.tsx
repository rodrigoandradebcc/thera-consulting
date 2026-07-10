import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { CustomersPage } from './CustomersPage';

const BASE = 'http://localhost:3000/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CustomersPage />
    </QueryClientProvider>,
  );
}

describe('CustomersPage', () => {
  it('omite o campo email do corpo do POST quando deixado em branco, em vez de enviar string vazia', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/customers`, () => HttpResponse.json([])),
      http.post(`${BASE}/customers`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: 'c1' }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /novo cliente/i }));
    await user.type(screen.getByLabelText('Nome'), 'ACME');
    await user.type(screen.getByLabelText('Documento'), '12345678901');
    // E-mail deixado em branco de propósito.
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    const body = captured.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('email');
    expect(body).toEqual({ name: 'ACME', document: '12345678901' });
  });
});
