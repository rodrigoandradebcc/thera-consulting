import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsNotEmpty, IsString } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Palete de água 500ml' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '129.90',
    description: 'Valor monetário como string, com duas casas. Nunca number.',
  })
  @IsDecimal({ decimal_digits: '1,2' })
  unitPrice!: string;
}
