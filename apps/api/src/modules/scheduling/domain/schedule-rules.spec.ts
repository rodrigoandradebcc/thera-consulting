import { BadRequestException } from '@nestjs/common';
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';
import { assertFutureDate, assertOrderAcceptsScheduleChange } from './schedule-rules';

describe('assertOrderAcceptsScheduleChange', () => {
  it.each([SalesOrderStatus.CRIADA, SalesOrderStatus.PLANEJADA, SalesOrderStatus.AGENDADA])(
    'permite alterar agendamento em %s',
    (status) => {
      expect(() => assertOrderAcceptsScheduleChange(status)).not.toThrow();
    },
  );

  it.each([SalesOrderStatus.EM_TRANSPORTE, SalesOrderStatus.ENTREGUE])(
    'bloqueia alteração de agendamento em %s',
    (status) => {
      expect(() => assertOrderAcceptsScheduleChange(status)).toThrow(OrderNotSchedulableException);
    },
  );
});

describe('assertFutureDate', () => {
  const now = new Date('2026-07-09T12:00:00.000Z');

  it('aceita data futura', () => {
    expect(() => assertFutureDate(new Date('2026-07-10'), now)).not.toThrow();
  });

  it('aceita o dia de hoje', () => {
    expect(() => assertFutureDate(new Date('2026-07-09'), now)).not.toThrow();
  });

  it('rejeita data passada', () => {
    expect(() => assertFutureDate(new Date('2026-07-08'), now)).toThrow(BadRequestException);
  });
});
