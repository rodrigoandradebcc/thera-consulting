import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw-server';
import { AuditTimeline } from './AuditTimeline';

const ID = '11111111-1111-4111-8111-111111111111';
const BASE = 'http://localhost:3000/api';

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuditTimeline salesOrderId={ID} />
    </QueryClientProvider>,
  );
}

describe('AuditTimeline', () => {
  it('mostra a criação sem tentar renderizar um before nulo', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json([
          {
            id: 'a1',
            action: 'ORDER_CREATED',
            entity: 'SALES_ORDER',
            entityId: ID,
            before: null,
            after: { status: 'CRIADA' },
            actor: 'rodrigo',
            createdAt: '2026-07-09T12:00:00.000Z',
          },
        ]),
      ),
    );
    renderTimeline();

    expect(await screen.findByText('Ordem de venda criada')).toBeInTheDocument();
    expect(screen.getByText('rodrigo')).toBeInTheDocument();
    expect(screen.queryByText(/de\s+—\s+para/i)).not.toBeInTheDocument();
  });

  it('mostra o diff de uma mudança de status', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json([
          {
            id: 'a2',
            action: 'STATUS_CHANGED',
            entity: 'SALES_ORDER',
            entityId: ID,
            before: { status: 'CRIADA' },
            after: { status: 'PLANEJADA' },
            actor: null,
            createdAt: '2026-07-09T12:05:00.000Z',
          },
        ]),
      ),
    );
    renderTimeline();

    expect(await screen.findByText('Status alterado')).toBeInTheDocument();
    expect(screen.getByText('CRIADA')).toBeInTheDocument();
    expect(screen.getByText('PLANEJADA')).toBeInTheDocument();
    expect(screen.getByText('sistema')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há eventos', async () => {
    server.use(http.get(`${BASE}/sales-orders/${ID}/audit`, () => HttpResponse.json([])));
    renderTimeline();

    expect(await screen.findByText(/nenhum evento/i)).toBeInTheDocument();
  });
});
