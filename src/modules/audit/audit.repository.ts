import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { RecordAuditInput } from './dto/record-audit.dto';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Tx, input: RecordAuditInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        salesOrderId: input.salesOrderId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        before: input.before ?? Prisma.DbNull,
        after: input.after ?? Prisma.DbNull,
        actor: input.actor,
      },
    });
  }

  listBySalesOrder(salesOrderId: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { salesOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Checagem de existência feita aqui, e não via SalesOrdersRepository,
   * para que o módulo de auditoria continue sendo folha na árvore de
   * dependências. Importar SalesOrdersModule criaria um ciclo.
   */
  async salesOrderExists(salesOrderId: string): Promise<boolean> {
    const found = await this.prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: { id: true },
    });
    return found !== null;
  }
}
