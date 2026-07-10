import { BadRequestException } from '@nestjs/common';
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';

export const MAX_DELIVERIES_PER_SLOT = 5;

const FROZEN_STATUSES: ReadonlySet<SalesOrderStatus> = new Set([
  SalesOrderStatus.EM_TRANSPORTE,
  SalesOrderStatus.ENTREGUE,
]);

export function assertOrderAcceptsScheduleChange(status: SalesOrderStatus): void {
  if (FROZEN_STATUSES.has(status)) {
    throw new OrderNotSchedulableException(
      `Não é possível alterar o agendamento de uma ordem de venda em ${status}.`,
    );
  }
}

export function assertFutureDate(date: Date, now: Date): void {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (date < startOfToday) {
    throw new BadRequestException('A data de entrega precisa ser hoje ou uma data futura.');
  }
}
