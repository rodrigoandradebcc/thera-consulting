import { ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/TableSkeleton';
import type { AuditLog } from '@/lib/api/audit';
import { dateTimeBR } from '@/lib/format';
import { ACTION_TEXT, labelFor } from './auditLabels';
import { useAuditQuery } from './queries';

function Diff({ log }: { log: AuditLog }) {
  // ORDER_CREATED tem before nulo. Dizer "de nada para CRIADA" não informa.
  if (log.before === null) {
    return (
      <dl className="mt-2 grid gap-1 text-sm">
        {Object.entries(log.after ?? {}).map(([field, value]) => (
          <div key={field} className="flex gap-2">
            <dt className="text-muted-foreground">{labelFor(field)}:</dt>
            <dd className="tabular">{String(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const fields = new Set([...Object.keys(log.before), ...Object.keys(log.after ?? {})]);

  return (
    <dl className="mt-2 grid gap-1 text-sm">
      {[...fields].map((field) => (
        <div key={field} className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">{labelFor(field)}:</dt>
          <dd className="flex items-center gap-2">
            <span className="tabular rounded bg-muted px-1.5 py-0.5">
              {String(log.before?.[field] ?? '—')}
            </span>
            <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="tabular rounded bg-emerald-100 px-1.5 py-0.5 font-medium dark:bg-emerald-950">
              {String(log.after?.[field] ?? '—')}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditTimeline({ salesOrderId }: { salesOrderId: string }) {
  const query = useAuditQuery(salesOrderId);

  if (query.isPending) return <TableSkeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return <EmptyState title="Nenhum evento" description="Nada foi auditado nesta ordem de venda ainda." />;
  }

  return (
    <ol className="space-y-3">
      {query.data.map((log) => (
        <li key={log.id} className="rounded-xl border border-border bg-card p-4 shadow-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{ACTION_TEXT[log.action]}</p>
            <time dateTime={log.createdAt} className="tabular text-xs text-muted-foreground">
              {dateTimeBR(log.createdAt)}
            </time>
          </div>
          <p className="text-xs text-muted-foreground">
            {log.entity === 'SALES_ORDER' ? 'Ordem de venda' : 'Agendamento'} • por{' '}
            <span className="font-medium">{log.actor ?? 'sistema'}</span>
          </p>
          <Diff log={log} />
        </li>
      ))}
    </ol>
  );
}
