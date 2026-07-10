import { SalesOrderStatus, ScheduleStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';

export function assertSchedulePrecondition(
  to: SalesOrderStatus,
  schedule: { status: ScheduleStatus } | null,
): void {
  if (to !== SalesOrderStatus.AGENDADA) {
    return;
  }
  if (schedule === null) {
    throw new OrderNotSchedulableException(
      'A ordem de venda não pode ser AGENDADA sem um agendamento de entrega.',
    );
  }
  if (schedule.status !== ScheduleStatus.CONFIRMADO) {
    throw new OrderNotSchedulableException(
      'A ordem de venda não pode ser AGENDADA porque o agendamento ainda não foi confirmado.',
    );
  }
}
