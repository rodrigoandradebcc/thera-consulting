import { Injectable } from '@nestjs/common';
import { Prisma, SalesOrder, SalesOrderStatus } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';

const WITH_RELATIONS = {
  customer: true,
  transportType: true,
  schedule: true,
  items: { include: { item: true } },
} satisfies Prisma.SalesOrderInclude;

export type SalesOrderWithRelations = Prisma.SalesOrderGetPayload<{
  include: typeof WITH_RELATIONS;
}>;

@Injectable()
export class SalesOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SalesOrderCreateInput, tx: Tx): Promise<SalesOrderWithRelations> {
    return tx.salesOrder.create({ data, include: WITH_RELATIONS });
  }

  findMany(query: ListSalesOrdersQueryDto): Promise<SalesOrderWithRelations[]> {
    return this.prisma.salesOrder.findMany({
      where: this.toWhere(query),
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<SalesOrderWithRelations | null> {
    return tx.salesOrder.findUnique({ where: { id }, include: WITH_RELATIONS });
  }

  async findByIdOrThrow(id: string, tx: Tx = this.prisma): Promise<SalesOrderWithRelations> {
    const order = await this.findById(id, tx);
    if (order === null) {
      throw new EntityNotFoundException('OrdemVenda', id);
    }
    return order;
  }

  updateStatus(id: string, status: SalesOrderStatus, tx: Tx): Promise<SalesOrder> {
    return tx.salesOrder.update({ where: { id }, data: { status } });
  }

  updateTransportType(id: string, transportTypeId: string, tx: Tx): Promise<SalesOrder> {
    return tx.salesOrder.update({ where: { id }, data: { transportTypeId } });
  }

  private toWhere(query: ListSalesOrdersQueryDto): Prisma.SalesOrderWhereInput {
    const where: Prisma.SalesOrderWhereInput = {};

    if (query.status !== undefined) where.status = query.status;
    if (query.customerId !== undefined) where.customerId = query.customerId;
    if (query.transportTypeId !== undefined) where.transportTypeId = query.transportTypeId;

    const scheduleFilter: Prisma.DeliveryScheduleWhereInput = {};
    if (query.scheduledFrom !== undefined || query.scheduledTo !== undefined) {
      scheduleFilter.scheduledDate = {
        ...(query.scheduledFrom !== undefined && { gte: new Date(query.scheduledFrom) }),
        ...(query.scheduledTo !== undefined && { lte: new Date(query.scheduledTo) }),
      };
    }
    if (query.window !== undefined) scheduleFilter.window = query.window;

    // Filtro por agendamento implica INNER JOIN: OVs sem agendamento não têm
    // data de entrega para filtrar, e por isso somem do resultado.
    if (Object.keys(scheduleFilter).length > 0) {
      where.schedule = { is: scheduleFilter };
    }

    return where;
  }
}
