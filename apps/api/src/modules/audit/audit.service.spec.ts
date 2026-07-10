import { AuditAction, AuditEntity } from '../../../generated/prisma/client';
import { Tx } from '../../common/prisma/prisma.types';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('grava o log usando o client transacional recebido', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const repository = {
      create,
      listBySalesOrder: jest.fn(),
      salesOrderExists: jest.fn(),
    } as unknown as AuditRepository;
    const service = new AuditService(repository);
    const tx = { marker: 'transactional-client' } as unknown as Tx;

    await service.record(tx, {
      salesOrderId: 'order-1',
      entity: AuditEntity.SALES_ORDER,
      entityId: 'order-1',
      action: AuditAction.STATUS_CHANGED,
      before: { status: 'CRIADA' },
      after: { status: 'PLANEJADA' },
      actor: 'system',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: AuditAction.STATUS_CHANGED, actor: 'system' }),
    );
  });
});
