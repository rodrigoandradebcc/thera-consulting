import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SALES_ORDER_STATUSES } from '@/domain/status-machine';
import { useCustomersQuery } from '@/features/customers/queries';
import { WINDOW_LABEL } from '@/features/scheduling/scheduleSchema';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { useSalesOrderFilters } from './useSalesOrderFilters';

const ALL = '__all__';
const WINDOWS = ['MANHA', 'TARDE', 'INTEGRAL'] as const;

export function SalesOrderFilters() {
  const { filters, setFilter, clear } = useSalesOrderFilters();
  const customers = useCustomersQuery();
  const transportTypes = useTransportTypesQuery();

  return (
    <section aria-label="Filtros" className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-7">
      <div>
        <Label htmlFor="f-status" className="mb-1.5">Status</Label>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(v) => setFilter('status', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-status"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {SALES_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-customer" className="mb-1.5">Cliente</Label>
        <Select
          value={filters.customerId ?? ALL}
          onValueChange={(v) => setFilter('customerId', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-customer"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {(customers.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-transport" className="mb-1.5">Transporte</Label>
        <Select
          value={filters.transportTypeId ?? ALL}
          onValueChange={(v) => setFilter('transportTypeId', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-transport"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {(transportTypes.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-window" className="mb-1.5">Janela</Label>
        <Select
          value={filters.window ?? ALL}
          onValueChange={(v) => setFilter('window', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-window"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {WINDOWS.map((w) => (
              <SelectItem key={w} value={w}>{WINDOW_LABEL[w]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-from" className="mb-1.5">Entrega de</Label>
        <Input
          id="f-from"
          type="date"
          value={filters.scheduledFrom ?? ''}
          onChange={(e) => setFilter('scheduledFrom', e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="f-to" className="mb-1.5">Entrega até</Label>
        <Input
          id="f-to"
          type="date"
          value={filters.scheduledTo ?? ''}
          onChange={(e) => setFilter('scheduledTo', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Filtrar por data de entrega esconde as ordens de venda que ainda não têm agendamento.
        </p>
      </div>

      <div className="flex items-end">
        <Button variant="ghost" onClick={clear} className="w-full">
          <X aria-hidden="true" className="size-4" /> Limpar
        </Button>
      </div>
    </section>
  );
}
