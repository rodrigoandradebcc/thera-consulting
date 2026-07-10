import type { DeliveryWindow, SalesOrder } from '@/lib/api/sales-orders';

/** Espelha MAX_DELIVERIES_PER_SLOT do backend. O 409 SlotUnavailable é a autoridade. */
export const MAX_DELIVERIES_PER_SLOT = 5;

export function slotKey(scheduledDate: string, window: DeliveryWindow): string {
  return `${scheduledDate}#${window}`;
}

/**
 * A API não expõe a contagem por slot. Calculamos a partir das OVs já carregadas,
 * o que antecipa o 409 sem inflar o contrato com um endpoint de capacidade.
 */
export function countConfirmedBySlot(orders: readonly SalesOrder[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const { schedule } = order;
    if (schedule === null || schedule.status !== 'CONFIRMADO') continue;
    const key = slotKey(schedule.scheduledDate, schedule.window);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Único lugar onde o limite `>= MAX_DELIVERIES_PER_SLOT` é decidido. */
export const isCountFull = (count: number): boolean => count >= MAX_DELIVERIES_PER_SLOT;

export function isSlotFull(
  orders: readonly SalesOrder[],
  scheduledDate: string,
  window: DeliveryWindow,
): boolean {
  const count = countConfirmedBySlot(orders).get(slotKey(scheduledDate, window)) ?? 0;
  return isCountFull(count);
}
