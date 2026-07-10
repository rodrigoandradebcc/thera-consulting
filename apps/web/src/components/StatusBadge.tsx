import {
  CalendarCheck,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  Clock,
  FileText,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ScheduleStatus } from '@/lib/api/sales-orders';
import type { SalesOrderStatus } from '@/domain/status-machine';
import { cn } from '@/lib/utils';

const ORDER: Record<SalesOrderStatus, { icon: LucideIcon; className: string }> = {
  CRIADA: {
    icon: FileText,
    className: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  },
  PLANEJADA: {
    icon: ClipboardCheck,
    className: 'bg-blue-100 text-blue-800 ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800',
  },
  AGENDADA: {
    icon: CalendarCheck,
    className: 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  },
  EM_TRANSPORTE: {
    icon: Truck,
    className: 'bg-cyan-100 text-cyan-900 ring-cyan-300 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800',
  },
  ENTREGUE: {
    icon: PackageCheck,
    className:
      'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  },
};

const SCHEDULE: Record<ScheduleStatus, { icon: LucideIcon; className: string }> = {
  PENDENTE: {
    icon: Clock,
    className: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  },
  CONFIRMADO: {
    icon: CheckCircle2,
    className:
      'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  },
};

const base =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset';

/** Cor + rótulo + ícone. Nunca cor sozinha: um print em preto e branco tem que informar. */
export function StatusBadge({ status }: { status: SalesOrderStatus }) {
  const { icon: Icon, className } = ORDER[status];
  return (
    <span className={cn(base, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {status.replace('_', ' ')}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const config = active
    ? {
        icon: CheckCircle2,
        label: 'Ativo',
        className:
          'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
      }
    : {
        icon: CircleSlash,
        label: 'Inativo',
        className:
          'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
      };
  const Icon = config.icon;
  return (
    <span className={cn(base, config.className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {config.label}
    </span>
  );
}

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const { icon: Icon, className } = SCHEDULE[status];
  return (
    <span className={cn(base, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </span>
  );
}
