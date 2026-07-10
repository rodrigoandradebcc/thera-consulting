import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Customer } from '../../../../generated/prisma/client';

export class CustomerResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() document!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: Date;

  static from(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      document: customer.document,
      email: customer.email,
      active: customer.active,
      createdAt: customer.createdAt,
    };
  }
}
