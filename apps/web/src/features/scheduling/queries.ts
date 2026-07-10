import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  confirmSchedule,
  createSchedule,
  rescheduleSchedule,
  type CreateScheduleBody,
  type Schedule,
} from '@/lib/api/scheduling';
import { queryKeys } from '@/lib/query-keys';

/**
 * `TVariables` é explícito (nunca inferido de um argumento) para que
 * `useConfirmSchedule` possa fixá-lo em `void`: isso torna `mutateAsync()`
 * chamável sem argumento algum, sem recorrer a `as never`.
 */
function useScheduleMutation<TData, TVariables>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    // Agendar gera AuditLog e muda o detalhe, a lista e o dashboard.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export const useCreateSchedule = (id: string) =>
  useScheduleMutation<Schedule, CreateScheduleBody>((body) => createSchedule(id, body));

export const useReschedule = (id: string) =>
  useScheduleMutation<Schedule, Partial<CreateScheduleBody>>((body) => rescheduleSchedule(id, body));

export const useConfirmSchedule = (id: string) =>
  useScheduleMutation<Schedule, void>(() => confirmSchedule(id));
