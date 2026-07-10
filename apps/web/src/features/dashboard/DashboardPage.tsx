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

/**
 * Formatar a data em UTC (ex.: cortar a string ISO devolvida pelo `Date`
 * serializado em UTC) não reflete o fuso local. Em São Paulo (UTC-3), entre
 * 21:00 e 23:59 já é o dia seguinte em UTC, então "hoje" e o limite de 7 dias
 * ficariam adiantados por três horas todo fim de dia — uma entrega de hoje
 * sumiria da tabela. Por isso a data é montada a partir dos getters locais
 * (`getFullYear`/`getMonth`/`getDate`), como em `scheduleSchema.ts`. `setDate`
 * com o dia somado já rola mês/ano corretamente.
 */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DashboardPage() {
  const all = useSalesOrdersQuery({});

  if (all.isPending) return <TableSkeleton rows={6} />;
  if (all.isError) return <ErrorState error={all.error} onRetry={() => void all.refetch()} />;

  const from = isoDate(0);
  const to = isoDate(DAYS_AHEAD);
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
