import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditLogResponse } from './dto/audit-log.response';

@ApiTags('audit')
@Controller('sales-orders/:id/audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Timeline de auditoria da OV, mais recente primeiro. Somente leitura.' })
  async findBySalesOrder(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogResponse[]> {
    const logs = await this.service.listBySalesOrder(id);
    return logs.map(AuditLogResponse.from);
  }
}
