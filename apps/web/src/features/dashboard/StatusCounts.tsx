import { Link } from 'react-router';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import type { SalesOrder } from '@/lib/api/sales-orders';

export function countByStatus(orders: readonly SalesOrder[]): Record<SalesOrderStatus, number> {
  // Literal, não derivado por cast: mesmo padrão de NEXT_STATUS/ACTION_LABEL em
  // status-machine.ts. Garante em tempo de compilação que os cinco estados
  // estejam presentes, sem type assertion.
  const counts: Record<SalesOrderStatus, number> = {
    CRIADA: 0,
    PLANEJADA: 0,
    AGENDADA: 0,
    EM_TRANSPORTE: 0,
    ENTREGUE: 0,
  };
  for (const order of orders) counts[order.status] += 1;
  return counts;
}

/**
 * A API não tem endpoint de agregação. Sem paginação, um GET traz tudo e a
 * contagem sai no cliente. Quando a paginação entrar, isto precisa de
 * GET /sales-orders/stats. Dívida registrada, não escondida.
 */
export function StatusCounts({ orders }: { orders: readonly SalesOrder[] }) {
  const counts = countByStatus(orders);

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {SALES_ORDER_STATUSES.map((status) => (
        <Link
          key={status}
          to={`/sales-orders?status=${status}`}
          className="rounded-lg border border-border bg-white p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <p className="text-xs font-medium text-slate-600">{status.replace('_', ' ')}</p>
          <p className="tabular text-3xl font-semibold">{counts[status]}</p>
        </Link>
      ))}
    </div>
  );
}
