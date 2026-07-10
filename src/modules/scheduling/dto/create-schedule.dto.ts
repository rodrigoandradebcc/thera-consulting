import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { DeliveryWindow } from '../../../../generated/prisma/client';

export class CreateScheduleDto {
  @ApiProperty({ example: '2026-08-01', description: 'Data de entrega (sem hora).' })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ enum: DeliveryWindow, description: 'Janela de atendimento.' })
  @IsEnum(DeliveryWindow)
  window!: DeliveryWindow;
}
