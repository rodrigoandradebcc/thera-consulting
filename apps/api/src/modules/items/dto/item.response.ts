import { ApiProperty } from '@nestjs/swagger';
import { Item } from '../../../../generated/prisma/client';

export class ItemResponse {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, example: '129.90' }) unitPrice!: string;
  @ApiProperty() active!: boolean;

  static from(item: Item): ItemResponse {
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      // Decimal serializado como string: number reintroduziria o erro de
      // ponto flutuante na fronteira HTTP.
      unitPrice: item.unitPrice.toFixed(2),
      active: item.active,
    };
  }
}
