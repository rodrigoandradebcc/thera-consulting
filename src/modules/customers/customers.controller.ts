import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponse } from './dto/customer.response';
import { LinkTransportTypesDto } from './dto/link-transport-types.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um cliente' })
  async create(@Body() dto: CreateCustomerDto): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os clientes' })
  async findAll(): Promise<CustomerResponse[]> {
    const customers = await this.service.findAll();
    return customers.map(CustomerResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um cliente' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.findByIdOrThrow(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um cliente. Baixa lógica via active: false.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.update(id, dto));
  }

  @Post(':id/transport-types')
  @HttpCode(200)
  @ApiOperation({ summary: 'Autoriza tipos de transporte. Aditivo e idempotente.' })
  async linkTransportTypes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkTransportTypesDto,
  ): Promise<{ transportTypeIds: string[] }> {
    const transportTypeIds = await this.service.linkTransportTypes(id, dto.transportTypeIds);
    return { transportTypeIds };
  }
}
