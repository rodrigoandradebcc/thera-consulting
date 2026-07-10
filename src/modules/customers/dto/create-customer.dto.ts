import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'ACME Distribuidora' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '12345678000199' })
  @IsString()
  @Length(11, 14)
  document!: string;

  @ApiPropertyOptional({ example: 'contato@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
