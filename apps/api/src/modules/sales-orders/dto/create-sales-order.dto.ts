import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class SalesOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  itemId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  transportTypeId!: string;

  /** @ArrayNotEmpty é a primeira linha de defesa da invariante "ao menos um item". */
  @ApiProperty({ type: [SalesOrderItemDto], description: 'Ao menos um item.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items!: SalesOrderItemDto[];
}
