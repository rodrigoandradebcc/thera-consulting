import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SalesOrderStatus } from '../../../../generated/prisma/client';

export class UpdateStatusDto {
  @ApiProperty({
    enum: SalesOrderStatus,
    description:
      'Status alvo. Só o sucessor imediato é aceito. AGENDADA exige agendamento confirmado.',
  })
  @IsEnum(SalesOrderStatus)
  status!: SalesOrderStatus;
}
