import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { TableSkeleton } from '@/components/TableSkeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useSalesOrdersQuery } from '@/features/sales-orders/queries';
import { WINDOW_LABEL } from '@/features/scheduling/scheduleSchema';
import type { SalesOrder, SalesOrderSchedule } from '@/lib/api/sales-orders';
import { dateBR } from '@/lib/format';
import { todayLocalIso } from '@/lib/today';
import { StatusCounts } from './StatusCounts';

const DAYS_AHEAD = 7;

interface ScheduledOrder {
  order: SalesOrder;
  schedule: SalesOrderSchedule;
}

/**
 * Extrai apenas OVs com agendamento. O `schedule` de cada par já sai estreitado
 * para não-nulo pelo próprio `flatMap` — sem non-null assertion no consumidor.
 * Mesma solução usada em `SchedulingPage`.
 */
function toScheduledOrders(orders: readonly SalesOrder[]): ScheduledOrder[] {
  return orders.flatMap((order) => (order.schedule === null ? [] : [{ order, schedule: order.schedule }]));
}

export function DashboardPage() {
  const all = useSalesOrdersQuery({});

  if (all.isPending) return <TableSkeleton rows={6} />;
  if (all.isError) return <ErrorState error={all.error} onRetry={() => void all.refetch()} />;

  const from = todayLocalIso(0);
  const to = todayLocalIso(DAYS_AHEAD);
  const upcoming = toScheduledOrders(all.data)
    .filter(({ schedule }) => schedule.scheduledDate >= from && schedule.scheduledDate <= to)
    .sort((a, b) => a.schedule.scheduledDate.localeCompare(b.schedule.scheduledDate));

  return (
    <>
      <PageHeader title="Monitoramento Operacional" />
      <StatusCounts orders={all.data} />

      <h2 className="mb-3 text-lg font-medium">Entregas agendadas — próximos {DAYS_AHEAD} dias</h2>

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega agendada"
          description={`Nada previsto para os próximos ${DAYS_AHEAD} dias.`}
        />
      ) : (
        <>
          {/* Tabela em telas médias e maiores */}
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OV</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Janela</TableHead>
                    <TableHead>Agendamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map(({ order, schedule }) => (
                    <TableRow key={order.id}>
                      <TableCell className="tabular">
                        <Link to={`/sales-orders/${order.id}`} className="underline underline-offset-2">
                          {order.number}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular">{dateBR(schedule.scheduledDate)}</TableCell>
                      <TableCell>{WINDOW_LABEL[schedule.window]}</TableCell>
                      <TableCell><ScheduleStatusBadge status={schedule.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cards em telas pequenas */}
          <ul className="grid gap-3 md:hidden">
            {upcoming.map(({ order, schedule }) => (
              <li key={order.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-baseline justify-between">
                  <Link
                    to={`/sales-orders/${order.id}`}
                    className="tabular font-medium underline underline-offset-2"
                  >
                    {order.number}
                  </Link>
                  <ScheduleStatusBadge status={schedule.status} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                  <dt className="text-slate-600">Data</dt>
                  <dd className="tabular text-right">{dateBR(schedule.scheduledDate)}</dd>
                  <dt className="text-slate-600">Janela</dt>
                  <dd className="text-right">{WINDOW_LABEL[schedule.window]}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
