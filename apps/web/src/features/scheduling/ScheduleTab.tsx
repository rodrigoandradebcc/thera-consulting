import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { toApiError } from '@/lib/errors';
import { dateBR } from '@/lib/format';
import { useConfirmSchedule, useCreateSchedule, useReschedule } from './queries';
import { scheduleSchema, WINDOW_LABEL, type ScheduleForm } from './scheduleSchema';

const selectClass = 'h-10 w-full rounded-md border border-border bg-white px-3 text-sm';
const windowOptions = scheduleSchema.shape.window.options;

export function ScheduleTab({ order }: { order: SalesOrder }) {
  const existing = order.schedule;
  const create = useCreateSchedule(order.id);
  const reschedule = useReschedule(order.id);
  const confirm = useConfirmSchedule(order.id);

  const form = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      scheduledDate: existing?.scheduledDate ?? '',
      window: existing?.window ?? 'MANHA',
    },
  });

  async function onSubmit(values: ScheduleForm): Promise<void> {
    try {
      if (existing === null) {
        await create.mutateAsync(values);
        toast.success('Entrega agendada.');
      } else {
        await reschedule.mutateAsync(values);
        toast.success('Entrega reagendada.');
      }
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  async function onConfirm(): Promise<void> {
    try {
      await confirm.mutateAsync();
      toast.success('Agendamento confirmado.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  const pending = create.isPending || reschedule.isPending;

  return (
    <div className="max-w-xl space-y-6 rounded-lg border border-border bg-white p-6">
      {existing !== null && (
        <div className="flex items-center gap-3">
          <ScheduleStatusBadge status={existing.status} />
          <span className="tabular text-sm">{dateBR(existing.scheduledDate)}</span>
          <span className="text-sm text-slate-600">{WINDOW_LABEL[existing.window]}</span>
          {existing.rescheduleCount > 0 && (
            <span className="text-xs text-slate-500">{existing.rescheduleCount}× reagendado</span>
          )}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="scheduledDate">Data de entrega</Label>
          <Input id="scheduledDate" type="date" {...form.register('scheduledDate')} />
          {form.formState.errors.scheduledDate && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {form.formState.errors.scheduledDate.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="window">Janela de atendimento</Label>
          <select id="window" className={selectClass} {...form.register('window')}>
            {windowOptions.map((w) => (
              <option key={w} value={w}>
                {WINDOW_LABEL[w]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {existing === null ? 'Agendar entrega' : 'Reagendar'}
          </Button>

          {existing !== null && existing.status === 'PENDENTE' && (
            <Button type="button" variant="outline" disabled={confirm.isPending} onClick={() => void onConfirm()}>
              Confirmar agendamento
            </Button>
          )}
        </div>
      </form>

      {existing !== null && existing.status === 'CONFIRMADO' && (
        <p className="text-xs text-slate-600">
          Reagendar mantém o agendamento confirmado. A OV não retrocede de status.
        </p>
      )}
    </div>
  );
}
