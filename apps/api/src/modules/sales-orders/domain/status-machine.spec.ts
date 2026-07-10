import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { InvalidStatusTransitionException } from '../../../common/exceptions';
import { assertTransition, NEXT_STATUS } from './status-machine';

const ALL = Object.values(SalesOrderStatus);

const VALID: ReadonlyArray<[SalesOrderStatus, SalesOrderStatus]> = [
  [SalesOrderStatus.CRIADA, SalesOrderStatus.PLANEJADA],
  [SalesOrderStatus.PLANEJADA, SalesOrderStatus.AGENDADA],
  [SalesOrderStatus.AGENDADA, SalesOrderStatus.EM_TRANSPORTE],
  [SalesOrderStatus.EM_TRANSPORTE, SalesOrderStatus.ENTREGUE],
];

function isValid(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return VALID.some(([f, t]) => f === from && t === to);
}

describe('status-machine', () => {
  it('cobre os cinco estados do fluxo', () => {
    expect(ALL).toHaveLength(5);
    expect(Object.keys(NEXT_STATUS)).toHaveLength(5);
  });

  it('ENTREGUE é terminal', () => {
    expect(NEXT_STATUS[SalesOrderStatus.ENTREGUE]).toBeNull();
  });

  describe.each(ALL)('a partir de %s', (from) => {
    it.each(ALL)('para %s', (to) => {
      if (isValid(from, to)) {
        expect(() => assertTransition(from, to)).not.toThrow();
      } else {
        expect(() => assertTransition(from, to)).toThrow(InvalidStatusTransitionException);
      }
    });
  });

  it('rejeita as 21 transições inválidas', () => {
    const invalid = ALL.flatMap((from) => ALL.filter((to) => !isValid(from, to)));
    expect(invalid).toHaveLength(21);
  });
});
