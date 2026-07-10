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

  const CUSTOMER_ID = '55555555-5555-4555-8555-555555555555';

  it('abre o diálogo de edição do cliente pré-preenchido com nome e e-mail atuais, e mostra o documento como somente leitura', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json([
          {
            id: CUSTOMER_ID,
            name: 'ACME',
            document: '12345678901',
            email: 'contato@acme.com',
            active: true,
            createdAt: '2026-07-09T12:00:00.000Z',
          },
        ]),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Editar cliente ACME' }));

    expect(await screen.findByLabelText('Nome')).toHaveValue('ACME');
    expect(screen.getByLabelText('E-mail (opcional)')).toHaveValue('contato@acme.com');
    const documentInput = screen.getByLabelText('Documento');
    expect(documentInput).toHaveValue('12345678901');
    expect(documentInput).toBeDisabled();
  });

  it('ao editar o nome do cliente e salvar, envia PATCH somente com os campos alterados, sem document', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json([
          {
            id: CUSTOMER_ID,
            name: 'ACME',
            document: '12345678901',
            email: null,
            active: true,
            createdAt: '2026-07-09T12:00:00.000Z',
          },
        ]),
      ),
      http.patch(`${BASE}/customers/${CUSTOMER_ID}`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({
          id: CUSTOMER_ID,
          name: 'ACME Ltda',
          document: '12345678901',
          email: null,
          active: true,
          createdAt: '2026-07-09T12:00:00.000Z',
        });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Editar cliente ACME' }));
    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'ACME Ltda');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    const body = captured.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual({ name: 'ACME Ltda' });
    expect(body).not.toHaveProperty('document');
  });
});
