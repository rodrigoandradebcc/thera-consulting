import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ACTION_LABEL, nextStatusOf } from '@/domain/status-machine';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { toApiError } from '@/lib/errors';
import { useUpdateStatus } from './queries';

/**
 * A UI mostra só a transição válida. Um select com os cinco estados convidaria
 * ao erro de propósito. O 409 do servidor continua sendo a autoridade: este
 * botão apenas antecipa a regra.
 */
export function NextStatusButton({ order }: { order: SalesOrder }) {
  const next = nextStatusOf(order.status);
  const updateStatus = useUpdateStatus(order.id);

  if (next === null) {
    return <p className="text-sm text-muted-foreground">Ciclo concluído. A ordem de venda foi entregue.</p>;
  }

  // `next` já foi estreitado para não-nulo acima. Capturamos em uma nova const
  // aqui — em vez de reafirmar o tipo com `as` — para que o fechamento de
  // `advance` abaixo enxergue o tipo já estreitado, sem type assertion.
  const nextStatus = next;

  const needsConfirmedSchedule = nextStatus === 'AGENDADA';
  const scheduleConfirmed = order.schedule?.status === 'CONFIRMADO';
  const blocked = needsConfirmedSchedule && !scheduleConfirmed;

  async function advance(): Promise<void> {
    try {
      await updateStatus.mutateAsync(nextStatus);
      toast.success(`Status atualizado para ${nextStatus}.`);
    } catch (error) {
      // Mensagem da API já vem em português e específica. Exibir literalmente.
      toast.error(toApiError(error).message);
    }
  }

  return (
    <div className="space-y-1">
      <Button disabled={blocked || updateStatus.isPending} onClick={() => void advance()}>
        {updateStatus.isPending ? 'Atualizando…' : ACTION_LABEL[nextStatus]}
      </Button>
      {blocked && (
        // Desabilitar sem dizer por quê é hostil.
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Confirme o agendamento antes de agendar a ordem de venda.
        </p>
      )}
    </div>
  );
}
