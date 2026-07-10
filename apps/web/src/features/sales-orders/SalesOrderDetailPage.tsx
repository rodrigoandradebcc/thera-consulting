import { useParams } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusStepper } from '@/components/StatusStepper';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuditTimeline } from '@/features/audit/AuditTimeline';
import { ScheduleTab } from '@/features/scheduling/ScheduleTab';
import { money } from '@/lib/format';
import { NextStatusButton } from './NextStatusButton';
import { SalesOrderItemsTab } from './SalesOrderItemsTab';
import { useSalesOrderQuery } from './queries';

export function SalesOrderDetailPage() {
  const { id = '' } = useParams();
  const query = useSalesOrderQuery(id);

  if (query.isPending) return <TableSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const order = query.data;
  const frozen = order.status === 'EM_TRANSPORTE' || order.status === 'ENTREGUE';

  return (
    <>
      <PageHeader
        title={order.number}
        description={`Total ${money(order.total)}`}
        actions={<NextStatusButton order={order} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <StatusBadge status={order.status} />
        <StatusStepper current={order.status} />
      </div>

      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          {!frozen && <TabsTrigger value="agendamento">Agendamento</TabsTrigger>}
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="itens" className="rounded-lg border border-border bg-white">
          <SalesOrderItemsTab items={order.items} total={order.total} />
        </TabsContent>

        {!frozen && (
          <TabsContent value="agendamento">
            <ScheduleTab order={order} />
          </TabsContent>
        )}

        <TabsContent value="auditoria">
          <AuditTimeline salesOrderId={order.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
