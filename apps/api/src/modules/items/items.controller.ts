import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateItemDto } from './dto/create-item.dto';
import { ItemResponse } from './dto/item.response';
import { ItemsService } from './items.service';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um item de catálogo' })
  async create(@Body() dto: CreateItemDto): Promise<ItemResponse> {
    return ItemResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os itens' })
  async findAll(): Promise<ItemResponse[]> {
    const items = await this.service.findAll();
    return items.map(ItemResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um item' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ItemResponse> {
    return ItemResponse.from(await this.service.findByIdOrThrow(id));
  }
}
