import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** `code` não é editável: é o identificador estável já referenciado por outras entidades. */
export class UpdateTransportTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Baixa lógica.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
