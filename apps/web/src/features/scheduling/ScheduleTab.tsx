import type { SalesOrder } from '@/lib/api/sales-orders';

// Stub da Task 9. Recebe `order` para o contrato de tipos já ficar estável.
export function ScheduleTab({ order }: { order: SalesOrder }) {
  return <p data-sales-order-id={order.id}>Em construção</p>;
}
