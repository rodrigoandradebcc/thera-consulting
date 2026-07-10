import { ApiProperty } from '@nestjs/swagger';
import { TransportType } from '../../../../generated/prisma/client';

export class TransportTypeResponse {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;

  static from(transportType: TransportType): TransportTypeResponse {
    return {
      id: transportType.id,
      code: transportType.code,
      name: transportType.name,
      active: transportType.active,
    };
  }
}
