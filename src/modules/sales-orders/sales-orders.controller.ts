import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/decorators/actor.decorator';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';
import { SalesOrderResponse } from './dto/sales-order.response';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTransportTypeOnOrderDto } from './dto/update-transport-type.dto';
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

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza o status. Só o sucessor imediato do fluxo é aceito.' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.updateStatus(id, dto.status, actor));
  }

  @Patch(':id/transport-type')
  @ApiOperation({ summary: 'Troca o tipo de transporte. Precisa estar autorizado para o cliente.' })
  async updateTransportType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransportTypeOnOrderDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(
      await this.service.updateTransportType(id, dto.transportTypeId, actor),
    );
  }
}
