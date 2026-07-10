import { api } from './client';

export type AuditAction =
  | 'ORDER_CREATED'
  | 'STATUS_CHANGED'
  | 'SCHEDULE_CHANGED'
  | 'TRANSPORT_CHANGED';

export type AuditEntity = 'SALES_ORDER' | 'DELIVERY_SCHEDULE';

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}

/** Timeline já vem ordenada por createdAt desc. */
export async function listAudit(salesOrderId: string): Promise<AuditLog[]> {
  const { data } = await api.get<AuditLog[]>(`/sales-orders/${salesOrderId}/audit`);
  return data;
}
