import { Check } from 'lucide-react';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import { cn } from '@/lib/utils';

/** Torna o fluxo linear visível de relance. Estado não é só um badge: é uma posição. */
export function StatusStepper({ current }: { current: SalesOrderStatus }) {
  const currentIndex = SALES_ORDER_STATUSES.indexOf(current);

  return (
    <ol aria-label="Progresso da ordem de venda" className="flex flex-wrap gap-2">
      {SALES_ORDER_STATUSES.map((status, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li
            key={status}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset',
              state === 'done' &&
                'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
              state === 'current' && 'bg-primary text-on-primary ring-primary',
              state === 'todo' && 'bg-card text-muted-foreground ring-border',
            )}
          >
            {state === 'done' && <Check aria-hidden="true" className="size-3.5" />}
            {status.replace('_', ' ')}
          </li>
        );
      })}
    </ol>
  );
}
