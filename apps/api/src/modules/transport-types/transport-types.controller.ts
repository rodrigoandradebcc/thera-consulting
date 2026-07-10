import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTransportTypeDto } from './dto/create-transport-type.dto';
import { TransportTypeResponse } from './dto/transport-type.response';
import { UpdateTransportTypeDto } from './dto/update-transport-type.dto';
import { TransportTypesService } from './transport-types.service';

@ApiTags('transport-types')
@Controller('transport-types')
export class TransportTypesController {
  constructor(private readonly service: TransportTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um tipo de transporte' })
  async create(@Body() dto: CreateTransportTypeDto): Promise<TransportTypeResponse> {
    return TransportTypeResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os tipos de transporte' })
  async findAll(): Promise<TransportTypeResponse[]> {
    const transportTypes = await this.service.findAll();
    return transportTypes.map(TransportTypeResponse.from);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um tipo de transporte. O code é imutável.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransportTypeDto,
  ): Promise<TransportTypeResponse> {
    return TransportTypeResponse.from(await this.service.update(id, dto));
  }
}
