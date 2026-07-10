import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateTransportTypeDto {
  @ApiProperty({ example: 'BITRUCK', description: 'Identificador estável, em maiúsculas.' })
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: 'code deve conter apenas A-Z, 0-9 e _' })
  code!: string;

  @ApiProperty({ example: 'Bi-truck' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
