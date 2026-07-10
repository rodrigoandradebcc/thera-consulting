import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DeliveryWindow } from '../../../../generated/prisma/client';

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: DeliveryWindow })
  @IsOptional()
  @IsEnum(DeliveryWindow)
  window?: DeliveryWindow;
}
