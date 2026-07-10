import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditEntity,
  Prisma,
  SalesOrderStatus,
} from '../../../generated/prisma/client';
import { EntityNotFoundException, TransportTypeNotAllowedException } from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomersRepository } from '../customers/customers.repository';
import { ItemsRepository } from '../items/items.repository';
import { assertOrderAcceptsScheduleChange } from '../scheduling/domain/schedule-rules';
import { TransportTypesRepository } from '../transport-types/transport-types.repository';
import { assertSchedulePrecondition } from './domain/schedule-precondition';
import { assertTransition } from './domain/status-machine';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';
import { SalesOrdersRepository, SalesOrderWithRelations } from './sales-orders.repository';

export function calculateTotal(
  lines: ReadonlyArray<{ quantity: number; unitPrice: Prisma.Decimal }>,
): Prisma.Decimal {
  return lines.reduce(
    (total, line) => total.plus(line.unitPrice.times(line.quantity)),
    new Prisma.Decimal(0),
  );
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: SalesOrdersRepository,
    private readonly customers: CustomersRepository,
    private readonly transportTypes: TransportTypesRepository,
    private readonly items: ItemsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSalesOrderDto, actor: string): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.customers.findById(dto.customerId, tx);
      if (customer === null) {
        throw new EntityNotFoundException('Cliente', dto.customerId);
      }

      const transportType = await this.transportTypes.findById(dto.transportTypeId, tx);
      if (transportType === null) {
        throw new EntityNotFoundException('TipoTransporte', dto.transportTypeId);
      }

      const authorized = await this.customers.isTransportAuthorized(
        dto.customerId,
        dto.transportTypeId,
        tx,
      );
      if (!authorized) {
        throw new TransportTypeNotAllowedException(dto.customerId, dto.transportTypeId);
      }

      const itemIds = dto.items.map((line) => line.itemId);
      if (new Set(itemIds).size !== itemIds.length) {
        throw new BadRequestException('A ordem de venda não pode repetir o mesmo item.');
      }

      const catalog = await this.items.findManyByIds(itemIds, tx);
      if (catalog.length !== itemIds.length) {
        const found = new Set(catalog.map((item) => item.id));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new EntityNotFoundException('Item', missing.join(', '));
      }

      const priceById = new Map(catalog.map((item) => [item.id, item.unitPrice]));
      const lines = dto.items.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        // Snapshot do preço: mudança futura no catálogo não reescreve a venda.
        unitPrice: priceById.get(line.itemId) as Prisma.Decimal,
      }));

      const order = await this.orders.create(
        {
          customer: { connect: { id: dto.customerId } },
          transportType: { connect: { id: dto.transportTypeId } },
          status: SalesOrderStatus.CRIADA,
          total: calculateTotal(lines),
          items: { create: lines },
        },
        tx,
      );

      await this.audit.record(tx, {
        salesOrderId: order.id,
        entity: AuditEntity.SALES_ORDER,
        entityId: order.id,
        action: AuditAction.ORDER_CREATED,
        before: null,
        after: {
          status: order.status,
          customerId: order.customerId,
          transportTypeId: order.transportTypeId,
          total: order.total.toFixed(2),
        },
        actor,
      });

      return order;
    });
  }

  findAll(query: ListSalesOrdersQueryDto): Promise<SalesOrderWithRelations[]> {
    return this.orders.findMany(query);
  }

  findByIdOrThrow(id: string): Promise<SalesOrderWithRelations> {
    return this.orders.findByIdOrThrow(id);
  }

  async updateStatus(
    id: string,
    status: SalesOrderStatus,
    actor: string,
  ): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.orders.findByIdOrThrow(id, tx);

      assertTransition(before.status, status);
      assertSchedulePrecondition(status, before.schedule);

      await this.orders.updateStatus(id, status, tx);

      await this.audit.record(tx, {
        salesOrderId: id,
        entity: AuditEntity.SALES_ORDER,
        entityId: id,
        action: AuditAction.STATUS_CHANGED,
        before: { status: before.status },
        after: { status },
        actor,
      });

      return this.orders.findByIdOrThrow(id, tx);
    });
  }

  async updateTransportType(
    id: string,
    transportTypeId: string,
    actor: string,
  ): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.orders.findByIdOrThrow(id, tx);

      // "A OV congelou" é a mesma regra para agendamento e para transporte.
      // Duplicá-la criaria duas fontes de verdade que divergem na primeira mudança.
      assertOrderAcceptsScheduleChange(before.status);

      const transportType = await this.transportTypes.findById(transportTypeId, tx);
      if (transportType === null) {
        throw new EntityNotFoundException('TipoTransporte', transportTypeId);
      }

      const authorized = await this.customers.isTransportAuthorized(
        before.customerId,
        transportTypeId,
        tx,
      );
      if (!authorized) {
        throw new TransportTypeNotAllowedException(before.customerId, transportTypeId);
      }

      await this.orders.updateTransportType(id, transportTypeId, tx);

      await this.audit.record(tx, {
        salesOrderId: id,
        entity: AuditEntity.SALES_ORDER,
        entityId: id,
        action: AuditAction.TRANSPORT_CHANGED,
        before: { transportTypeId: before.transportTypeId },
        after: { transportTypeId },
        actor,
      });

      return this.orders.findByIdOrThrow(id, tx);
    });
  }
}
