import type { AuditAction } from '@/lib/api/audit';

export const ACTION_TEXT: Record<AuditAction, string> = {
  ORDER_CREATED: 'Ordem de venda criada',
  STATUS_CHANGED: 'Status alterado',
  SCHEDULE_CHANGED: 'Agendamento alterado',
  TRANSPORT_CHANGED: 'Tipo de transporte alterado',
};

export const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  customerId: 'Cliente',
  transportTypeId: 'Transporte',
  total: 'Total',
  scheduledDate: 'Data de entrega',
  window: 'Janela',
};

export function labelFor(field: string): string {
  return FIELD_LABEL[field] ?? field;
}
