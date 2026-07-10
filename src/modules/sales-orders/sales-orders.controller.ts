import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/decorators/actor.decorator';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';
import { SalesOrderResponse } from './dto/sales-order.response';
import { SalesOrdersService } from './sales-orders.service';

@ApiTags('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma ordem de venda com status CRIADA' })
  async create(
    @Body() dto: CreateSalesOrderDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.create(dto, actor));
  }

  @Get()
  @ApiOperation({
    summary: 'Monitoramento operacional: filtra por status, cliente, transporte e data',
  })
  async findAll(@Query() query: ListSalesOrdersQueryDto): Promise<SalesOrderResponse[]> {
    const orders = await this.service.findAll(query);
    return orders.map(SalesOrderResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da ordem de venda' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.findByIdOrThrow(id));
  }
}
