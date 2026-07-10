import { SalesOrderStatus, ScheduleStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';
import { assertSchedulePrecondition } from './schedule-precondition';

describe('assertSchedulePrecondition', () => {
  it('rejeita AGENDADA sem agendamento', () => {
    expect(() => assertSchedulePrecondition(SalesOrderStatus.AGENDADA, null)).toThrow(
      OrderNotSchedulableException,
    );
  });

  it('rejeita AGENDADA com agendamento apenas PENDENTE', () => {
    expect(() =>
      assertSchedulePrecondition(SalesOrderStatus.AGENDADA, { status: ScheduleStatus.PENDENTE }),
    ).toThrow(OrderNotSchedulableException);
  });

  it('aceita AGENDADA com agendamento CONFIRMADO', () => {
    expect(() =>
      assertSchedulePrecondition(SalesOrderStatus.AGENDADA, { status: ScheduleStatus.CONFIRMADO }),
    ).not.toThrow();
  });

  it('ignora a pré-condição para alvos diferentes de AGENDADA', () => {
    expect(() => assertSchedulePrecondition(SalesOrderStatus.PLANEJADA, null)).not.toThrow();
    expect(() => assertSchedulePrecondition(SalesOrderStatus.ENTREGUE, null)).not.toThrow();
  });
});
