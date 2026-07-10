import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { dateBR, money } from '@/lib/format';
import { SalesOrderFilters } from './SalesOrderFilters';
import { useSalesOrdersQuery } from './queries';
import { useSalesOrderFilters } from './useSalesOrderFilters';

export function SalesOrdersListPage() {
  const { filters } = useSalesOrderFilters();
  const query = useSalesOrdersQuery(filters);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        eyebrow="Operações"
        title="Ordens de Venda"
        description="Monitoramento operacional"
        actions={
          <Button asChild>
            <Link to="/sales-orders/new">
              <Plus aria-hidden="true" className="size-4" /> Nova OV
            </Link>
          </Button>
        }
      />

      <SalesOrderFilters />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}

      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de venda"
          description="Ajuste os filtros ou crie a primeira OV."
          action={
            <Button asChild>
              <Link to="/sales-orders/new">Criar OV</Link>
            </Button>
          }
        />
      )}

      {query.isSuccess && query.data.length > 0 && (
        <>
          {/* Tabela em telas médias e maiores */}
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Itens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.map((order) => (
                    <TableRow
                      key={order.id}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => void navigate(`/sales-orders/${order.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void navigate(`/sales-orders/${order.id}`);
                      }}
                    >
                      <TableCell className="tabular">{order.number}</TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="tabular text-right">{money(order.total)}</TableCell>
                      <TableCell className="tabular">
                        {order.schedule === null ? '—' : dateBR(order.schedule.scheduledDate)}
                      </TableCell>
                      <TableCell>{order.items.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cards em telas pequenas */}
          <ul className="grid gap-3 md:hidden">
            {query.data.map((order) => (
              <li key={order.id} className="rounded-xl border border-border bg-card p-4 shadow-panel">
                <Link
                  to={`/sales-orders/${order.id}`}
                  className="block focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="tabular font-medium">{order.number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="tabular text-right">{money(order.total)}</dd>
                    <dt className="text-muted-foreground">Entrega</dt>
                    <dd className="tabular text-right">
                      {order.schedule === null ? '—' : dateBR(order.schedule.scheduledDate)}
                    </dd>
                    <dt className="text-muted-foreground">Itens</dt>
                    <dd className="tabular text-right">{order.items.length}</dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
