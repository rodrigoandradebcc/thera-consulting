import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { Tx } from '../../common/prisma/prisma.types';
import { AuditRepository } from './audit.repository';
import { RecordAuditInput } from './dto/record-audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  /**
   * Recebe o client transacional do chamador. Nunca abre transação própria:
   * o log precisa sofrer rollback junto com a mutação que o originou.
   */
  record(tx: Tx, input: RecordAuditInput): Promise<void> {
    return this.repository.create(tx, input);
  }

  async listBySalesOrder(salesOrderId: string): Promise<AuditLog[]> {
    if (!(await this.repository.salesOrderExists(salesOrderId))) {
      throw new EntityNotFoundException('OrdemVenda', salesOrderId);
    }
    return this.repository.listBySalesOrder(salesOrderId);
  }
}
