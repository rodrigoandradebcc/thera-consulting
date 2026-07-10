import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateTransportTypeOnOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Precisa estar autorizado para o cliente da OV.' })
  @IsUUID('4')
  transportTypeId!: string;
}
