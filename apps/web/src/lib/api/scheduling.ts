import { api } from './client';
import type { DeliveryWindow, ScheduleStatus } from './sales-orders';

export interface Schedule {
  id: string;
  salesOrderId: string;
  scheduledDate: string;
  window: DeliveryWindow;
  status: ScheduleStatus;
  rescheduleCount: number;
}

export interface CreateScheduleBody {
  scheduledDate: string;
  window: DeliveryWindow;
}

export async function createSchedule(
  salesOrderId: string,
  body: CreateScheduleBody,
): Promise<Schedule> {
  const { data } = await api.post<Schedule>(`/sales-orders/${salesOrderId}/schedule`, body);
  return data;
}

/** Reagendar não rebaixa CONFIRMADO para PENDENTE. */
export async function rescheduleSchedule(
  salesOrderId: string,
  body: Partial<CreateScheduleBody>,
): Promise<Schedule> {
  const { data } = await api.patch<Schedule>(`/sales-orders/${salesOrderId}/schedule`, body);
  return data;
}

export async function confirmSchedule(salesOrderId: string): Promise<Schedule> {
  const { data } = await api.post<Schedule>(`/sales-orders/${salesOrderId}/schedule/confirm`);
  return data;
}
