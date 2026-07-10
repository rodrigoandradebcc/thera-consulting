import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SalesOrderWithRelations } from '../sales-orders.repository';

export class SalesOrderItemResponse {
  @ApiProperty() itemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, example: '129.90' }) unitPrice!: string;
}

export class SalesOrderScheduleResponse {
  @ApiProperty({ example: '2026-08-01' }) scheduledDate!: string;
  @ApiProperty() window!: string;
  @ApiProperty() status!: string;
  @ApiProperty() rescheduleCount!: number;
}

export class SalesOrderResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'OV-000042' }) number!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() transportTypeId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, example: '528.30' }) total!: string;
  @ApiProperty({ type: [SalesOrderItemResponse] }) items!: SalesOrderItemResponse[];
  @ApiPropertyOptional({ type: SalesOrderScheduleResponse, nullable: true })
  schedule!: SalesOrderScheduleResponse | null;
  @ApiProperty() createdAt!: Date;

  static from(order: SalesOrderWithRelations): SalesOrderResponse {
    return {
      id: order.id,
      // Formatação de apresentação sobre a sequence do Postgres.
      number: `OV-${String(order.orderNumber).padStart(6, '0')}`,
      customerId: order.customerId,
      transportTypeId: order.transportTypeId,
      status: order.status,
      total: order.total.toFixed(2),
      items: order.items.map((line) => ({
        itemId: line.itemId,
        sku: line.item.sku,
        name: line.item.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toFixed(2),
      })),
      schedule:
        order.schedule === null
          ? null
          : {
              scheduledDate: order.schedule.scheduledDate.toISOString().slice(0, 10),
              window: order.schedule.window,
              status: order.schedule.status,
              rescheduleCount: order.schedule.rescheduleCount,
            },
      createdAt: order.createdAt,
    };
  }
}
