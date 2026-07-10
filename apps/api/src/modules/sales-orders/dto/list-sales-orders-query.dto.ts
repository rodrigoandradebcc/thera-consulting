import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DeliveryWindow, SalesOrderStatus } from '../../../../generated/prisma/client';

export class ListSalesOrdersQueryDto {
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  transportTypeId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Data de entrega agendada, inclusiva.',
  })
  @IsOptional()
  @IsDateString()
  scheduledFrom?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Data de entrega agendada, inclusiva.',
  })
  @IsOptional()
  @IsDateString()
  scheduledTo?: string;

  @ApiPropertyOptional({ enum: DeliveryWindow })
  @IsOptional()
  @IsEnum(DeliveryWindow)
  window?: DeliveryWindow;
}
