import { api } from './client';
import type { SalesOrderStatus } from '@/domain/status-machine';

export type DeliveryWindow = 'MANHA' | 'TARDE' | 'INTEGRAL';
export type ScheduleStatus = 'PENDENTE' | 'CONFIRMADO';

export interface SalesOrderItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Decimal serializado. Nunca usar em aritmética. */
  unitPrice: string;
}

export interface SalesOrderSchedule {
  scheduledDate: string;
  window: DeliveryWindow;
  status: ScheduleStatus;
  rescheduleCount: number;
}

export interface SalesOrder {
  id: string;
  number: string;
  customerId: string;
  transportTypeId: string;
  status: SalesOrderStatus;
  total: string;
  items: SalesOrderItem[];
  schedule: SalesOrderSchedule | null;
  createdAt: string;
}

export interface ListSalesOrdersQuery {
  status?: SalesOrderStatus;
  customerId?: string;
  transportTypeId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  window?: DeliveryWindow;
}

export interface CreateSalesOrderBody {
  customerId: string;
  transportTypeId: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export async function listSalesOrders(query: ListSalesOrdersQuery): Promise<SalesOrder[]> {
  const { data } = await api.get<SalesOrder[]>('/sales-orders', { params: query });
  return data;
}

export async function getSalesOrder(id: string): Promise<SalesOrder> {
  const { data } = await api.get<SalesOrder>(`/sales-orders/${id}`);
  return data;
}

export async function createSalesOrder(body: CreateSalesOrderBody): Promise<SalesOrder> {
  const { data } = await api.post<SalesOrder>('/sales-orders', body);
  return data;
}

export async function updateSalesOrderStatus(
  id: string,
  status: SalesOrderStatus,
): Promise<SalesOrder> {
  const { data } = await api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status });
  return data;
}

export async function updateSalesOrderTransport(
  id: string,
  transportTypeId: string,
): Promise<SalesOrder> {
  const { data } = await api.patch<SalesOrder>(`/sales-orders/${id}/transport-type`, {
    transportTypeId,
  });
  return data;
}
