import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { salesOrderFixture } from '@/test/handlers';
import { NextStatusButton } from './NextStatusButton';

function renderButton(order: SalesOrder) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextStatusButton order={order} />
    </QueryClientProvider>,
  );
}

describe('NextStatusButton', () => {
  it('mostra apenas a próxima transição válida', () => {
    renderButton({ ...salesOrderFixture, status: 'CRIADA' });
    expect(screen.getByRole('button', { name: 'Planejar ordem de venda' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Despachar' })).not.toBeInTheDocument();
  });

  it('desabilita AGENDADA sem agendamento e explica por quê', () => {
    renderButton({ ...salesOrderFixture, status: 'PLANEJADA', schedule: null });
    expect(screen.getByRole('button', { name: 'Agendar ordem de venda' })).toBeDisabled();
    expect(screen.getByText(/confirme o agendamento/i)).toBeInTheDocument();
  });

  it('desabilita AGENDADA com agendamento apenas PENDENTE', () => {
    renderButton({
      ...salesOrderFixture,
      status: 'PLANEJADA',
      schedule: { scheduledDate: '2099-08-01', window: 'MANHA', status: 'PENDENTE', rescheduleCount: 0 },
    });
    expect(screen.getByRole('button', { name: 'Agendar ordem de venda' })).toBeDisabled();
  });

  it('habilita AGENDADA com agendamento CONFIRMADO', () => {
    renderButton({
      ...salesOrderFixture,
      status: 'PLANEJADA',
      schedule: { scheduledDate: '2099-08-01', window: 'MANHA', status: 'CONFIRMADO', rescheduleCount: 0 },
    });
    expect(screen.getByRole('button', { name: 'Agendar ordem de venda' })).toBeEnabled();
  });

  it('não renderiza botão quando ENTREGUE', () => {
    renderButton({ ...salesOrderFixture, status: 'ENTREGUE' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/ciclo concluído/i)).toBeInTheDocument();
  });
});
