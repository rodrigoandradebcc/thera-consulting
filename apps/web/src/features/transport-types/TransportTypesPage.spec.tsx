import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { TransportTypesPage } from './TransportTypesPage';

const BASE = 'http://localhost:3000/api';
const TRANSPORT = '33333333-3333-4333-8333-333333333333';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TransportTypesPage />
    </QueryClientProvider>,
  );
}

describe('TransportTypesPage', () => {
  it('mostra o texto explicativo e o botão de confirmação destrutivo; cancelar não dispara PATCH', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
      ),
      http.patch(`${BASE}/transport-types/${TRANSPORT}`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: false });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText(/baixa lógica/i)).toBeInTheDocument();
    // O diálogo tem dois botões de rótulo "Desativar" (o trigger e a confirmação);
    // o de confirmação é identificado pelo variant destrutivo.
    const destructiveButton = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'Desativar' && btn.getAttribute('data-variant') === 'destructive');
    expect(destructiveButton).toHaveAttribute('data-variant', 'destructive');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(captured).not.toHaveBeenCalled();
  });

  it('confirmar envia PATCH { active: false } e nada além disso — sem o campo code', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
      ),
      http.patch(`${BASE}/transport-types/${TRANSPORT}`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: false });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Desativar' }));
    const destructiveButton = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'Desativar' && btn.getAttribute('data-variant') === 'destructive');
    if (destructiveButton === undefined) throw new Error('botão de confirmação não encontrado');
    await user.click(destructiveButton);

    await waitFor(() => expect(captured).toHaveBeenCalled());
    expect(captured.mock.calls[0][0]).toEqual({ active: false });
    expect(captured.mock.calls[0][0]).not.toHaveProperty('code');
  });

  it('um 409 ao criar mapeia para erro de campo em "code", num role="alert" perto do campo', async () => {
    server.use(
      http.get(`${BASE}/transport-types`, () => HttpResponse.json([])),
      http.post(`${BASE}/transport-types`, () =>
        HttpResponse.json({ statusCode: 409, error: 'Conflict', message: 'Código já cadastrado.' }, { status: 409 }),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /novo tipo/i }));
    await user.type(screen.getByLabelText('Código'), 'CAMINHAO');
    await user.type(screen.getByLabelText('Nome'), 'Caminhão');
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Código já cadastrado.');
  });
});
