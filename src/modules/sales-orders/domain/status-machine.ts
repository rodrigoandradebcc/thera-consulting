import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { InvalidStatusTransitionException } from '../../../common/exceptions';

export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  [SalesOrderStatus.CRIADA]: SalesOrderStatus.PLANEJADA,
  [SalesOrderStatus.PLANEJADA]: SalesOrderStatus.AGENDADA,
  [SalesOrderStatus.AGENDADA]: SalesOrderStatus.EM_TRANSPORTE,
  [SalesOrderStatus.EM_TRANSPORTE]: SalesOrderStatus.ENTREGUE,
  [SalesOrderStatus.ENTREGUE]: null,
};

export function assertTransition(from: SalesOrderStatus, to: SalesOrderStatus): void {
  if (NEXT_STATUS[from] !== to) {
    throw new InvalidStatusTransitionException(from, to);
  }
}
