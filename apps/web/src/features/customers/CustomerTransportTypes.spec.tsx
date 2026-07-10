import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { CustomerTransportTypes } from './CustomerTransportTypes';

const BASE = 'http://localhost:3000/api';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const TRANSPORT = '33333333-3333-4333-8333-333333333333';
const TRANSPORT2 = '55555555-5555-4555-8555-555555555555';

function renderComponent(customerId = CUSTOMER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CustomerTransportTypes customerId={customerId} />
    </QueryClientProvider>,
  );
}

describe('CustomerTransportTypes', () => {
  it('não mostra o aviso de "nenhum transporte" enquanto as buscas ainda estão carregando', () => {
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () => new Promise(() => {})),
      http.get(`${BASE}/transport-types`, () => new Promise(() => {})),
    );
    renderComponent();

    expect(screen.queryByText(/Nenhum\. Sem ao menos um/i)).not.toBeInTheDocument();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('renderiza estado de erro com retry quando GET /customers/:id/transport-types falha (500)', async () => {
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () =>
        HttpResponse.json({ statusCode: 500, error: 'Internal', message: 'Erro interno' }, { status: 500 }),
      ),
      http.get(`${BASE}/transport-types`, () => HttpResponse.json([])),
    );
    renderComponent();

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum\. Sem ao menos um/i)).not.toBeInTheDocument();
  });

  it('mostra o aviso de que o cliente não pode ter OVs quando não há transportes vinculados', async () => {
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () => HttpResponse.json({ transportTypeIds: [] })),
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
      ),
    );
    renderComponent();

    expect(await screen.findByText(/Nenhum\. Sem ao menos um/i)).toBeInTheDocument();
  });

  it('rotula o botão de ação como "Adicionar transportes", nunca "Salvar"', async () => {
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () => HttpResponse.json({ transportTypeIds: [] })),
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
      ),
    );
    renderComponent();

    expect(await screen.findByRole('button', { name: 'Adicionar transportes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('não lista transportes já vinculados como opções selecionáveis', async () => {
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () =>
        HttpResponse.json({ transportTypeIds: [TRANSPORT] }),
      ),
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([
          { id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true },
          { id: TRANSPORT2, code: 'VAN', name: 'Van', active: true },
        ]),
      ),
    );
    renderComponent();

    await screen.findByLabelText('Van');
    expect(screen.queryByLabelText('Caminhão')).not.toBeInTheDocument();
  });

  it('envia apenas os ids recém-selecionados, sem reenviar os já vinculados', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () =>
        HttpResponse.json({ transportTypeIds: [TRANSPORT] }),
      ),
      http.get(`${BASE}/transport-types`, () =>
        HttpResponse.json([
          { id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true },
          { id: TRANSPORT2, code: 'VAN', name: 'Van', active: true },
        ]),
      ),
      http.post(`${BASE}/customers/${CUSTOMER}/transport-types`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ transportTypeIds: [TRANSPORT, TRANSPORT2] });
      }),
    );
    renderComponent();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Van'));
    await user.click(screen.getByRole('button', { name: 'Adicionar transportes' }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    expect(captured.mock.calls[0][0]).toEqual({ transportTypeIds: [TRANSPORT2] });
  });
});
