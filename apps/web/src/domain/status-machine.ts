/**
 * Espelho de apps/api/src/modules/sales-orders/domain/status-machine.ts.
 *
 * A duplicação é deliberada: o botão desabilitado é dica visual, não autoridade.
 * Se este mapa divergir do backend, o servidor rejeita com 409 e o usuário vê
 * a mensagem. O teste ao lado trava os cinco estados.
 */
export const SALES_ORDER_STATUSES = [
  'CRIADA',
  'PLANEJADA',
  'AGENDADA',
  'EM_TRANSPORTE',
  'ENTREGUE',
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  CRIADA: 'PLANEJADA',
  PLANEJADA: 'AGENDADA',
  AGENDADA: 'EM_TRANSPORTE',
  EM_TRANSPORTE: 'ENTREGUE',
  ENTREGUE: null,
};

export function nextStatusOf(status: SalesOrderStatus): SalesOrderStatus | null {
  return NEXT_STATUS[status];
}

/** Rótulo do botão que leva a cada estado. Verbo, não substantivo. */
export const ACTION_LABEL: Record<SalesOrderStatus, string> = {
  CRIADA: 'Criar ordem de venda',
  PLANEJADA: 'Planejar ordem de venda',
  AGENDADA: 'Agendar ordem de venda',
  EM_TRANSPORTE: 'Despachar',
  ENTREGUE: 'Marcar como entregue',
};
