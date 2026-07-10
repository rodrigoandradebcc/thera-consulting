import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { salesOrderFixture } from '@/test/handlers';
import { DashboardPage } from './DashboardPage';

const BASE = 'http://localhost:3000/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <DashboardPage /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta as OVs por status no cliente', async () => {
    server.use(
      http.get(`${BASE}/sales-orders`, () =>
        HttpResponse.json([
          { ...salesOrderFixture, id: '1', status: 'CRIADA' },
          { ...salesOrderFixture, id: '2', status: 'CRIADA' },
          { ...salesOrderFixture, id: '3', status: 'ENTREGUE' },
        ]),
      ),
    );
    renderPage();

    const criada = await screen.findByRole('link', { name: /CRIADA/ });
    expect(criada).toHaveTextContent('2');
    expect(criada).toHaveAttribute('href', '/sales-orders?status=CRIADA');
  });

  it('mostra estado vazio na tabela de entregas quando nada está agendado', async () => {
    server.use(http.get(`${BASE}/sales-orders`, () => HttpResponse.json([salesOrderFixture])));
    renderPage();

    expect(await screen.findByText(/nenhuma entrega agendada/i)).toBeInTheDocument();
  });

  it('inclui na tabela uma entrega de hoje mesmo tarde da noite no fuso local (São Paulo)', async () => {
    // 23:30 em São Paulo (UTC-3) já é 02:30 UTC do dia seguinte. Se a janela de
    // "próximos 7 dias" for calculada com `toISOString()`, tanto "hoje" quanto
    // o limite superior ficam um dia à frente por três horas todo fim de dia,
    // e uma entrega agendada para hoje (2026-07-09) desapareceria da tabela.
    // `shouldAdvanceTime` mantém o relógio real correndo para os timers reais
    // que o testing-library usa internamente (waitFor/MutationObserver);
    // só `Date`/`new Date()` fica congelado no instante definido abaixo.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-10T02:30:00Z')); // 2026-07-09T23:30:00-03:00

    server.use(
      http.get(`${BASE}/sales-orders`, () =>
        HttpResponse.json([
          {
            ...salesOrderFixture,
            id: '1',
            status: 'AGENDADA',
            schedule: {
              scheduledDate: '2026-07-09',
              window: 'MANHA',
              status: 'PENDENTE',
              rescheduleCount: 0,
            },
          },
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText(salesOrderFixture.number)).toBeInTheDocument();
    expect(screen.getByText('09/07/2026')).toBeInTheDocument();
  });

  it('renderiza cards de status com zero ordens', async () => {
    server.use(
      http.get(`${BASE}/sales-orders`, () =>
        HttpResponse.json([
          { ...salesOrderFixture, id: '1', status: 'CRIADA' },
          { ...salesOrderFixture, id: '2', status: 'CRIADA' },
        ]),
      ),
    );
    renderPage();

    const planejada = await screen.findByRole('link', { name: /PLANEJADA/ });
    expect(planejada).toHaveTextContent('0');
  });
});
