import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countConfirmedBySlot, MAX_DELIVERIES_PER_SLOT, slotKey } from '@/domain/schedule';
import { useSalesOrdersQuery } from '@/features/sales-orders/queries';
import type { SalesOrder, SalesOrderSchedule } from '@/lib/api/sales-orders';
import { toApiError } from '@/lib/errors';
import { dateBR } from '@/lib/format';
import { useConfirmSchedule } from './queries';
import { WINDOW_LABEL } from './scheduleSchema';

interface ScheduledOrder {
  order: SalesOrder;
  schedule: SalesOrderSchedule;
}

/**
 * Extrai apenas OVs com agendamento. O `schedule` de cada par já sai estreitado
 * para não-nulo pelo próprio `flatMap` — sem non-null assertion no consumidor.
 */
function toScheduledOrders(orders: readonly SalesOrder[]): ScheduledOrder[] {
  return orders.flatMap((order) => (order.schedule === null ? [] : [{ order, schedule: order.schedule }]));
}

function ConfirmButton({ salesOrderId, full }: { salesOrderId: string; full: boolean }) {
  const confirm = useConfirmSchedule(salesOrderId);

  async function run(): Promise<void> {
    try {
      await confirm.mutateAsync();
      toast.success('Agendamento confirmado.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={full || confirm.isPending} onClick={() => void run()}>
        Confirmar
      </Button>
      {full && <span className="text-xs text-amber-800">Slot cheio</span>}
    </div>
  );
}

/** Visão, não CRUD novo: mostra somente OVs agendadas e oferece confirmar/reagendar. */
export function SchedulingPage() {
  const query = useSalesOrdersQuery({});

  if (query.isPending) return <TableSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const scheduled = toScheduledOrders(query.data).sort((a, b) =>
    a.schedule.scheduledDate.localeCompare(b.schedule.scheduledDate),
  );

  const counts = countConfirmedBySlot(query.data);

  if (scheduled.length === 0) {
    return (
      <>
        <PageHeader title="Central de Agendamento" />
        <EmptyState
          title="Nenhuma entrega agendada"
          description="Agende uma entrega a partir do detalhe de uma OV."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Central de Agendamento"
        description={`Capacidade de ${MAX_DELIVERIES_PER_SLOT} entregas confirmadas por data e janela`}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OV</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Janela</TableHead>
              <TableHead>Ocupação</TableHead>
              <TableHead>Agendamento</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduled.map(({ order, schedule }) => {
              const key = slotKey(schedule.scheduledDate, schedule.window);
              const used = counts.get(key) ?? 0;
              const full = used >= MAX_DELIVERIES_PER_SLOT;

              return (
                <TableRow key={order.id}>
                  <TableCell className="tabular">{order.number}</TableCell>
                  <TableCell className="tabular">{dateBR(schedule.scheduledDate)}</TableCell>
                  <TableCell>{WINDOW_LABEL[schedule.window]}</TableCell>
                  <TableCell className="tabular">{`${used}/${MAX_DELIVERIES_PER_SLOT}`}</TableCell>
                  <TableCell>
                    <ScheduleStatusBadge status={schedule.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {schedule.status === 'PENDENTE' ? (
                      <ConfirmButton salesOrderId={order.id} full={full} />
                    ) : (
                      <span className="text-sm text-slate-500">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
