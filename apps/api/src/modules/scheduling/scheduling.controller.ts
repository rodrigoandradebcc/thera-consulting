import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/decorators/actor.decorator';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { ScheduleResponse } from './dto/schedule.response';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('scheduling')
@Controller('sales-orders/:id/schedule')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @Post()
  @ApiOperation({ summary: 'Define data de entrega e janela de atendimento' })
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScheduleDto,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.create(id, dto, actor));
  }

  @Patch()
  @ApiOperation({ summary: 'Reagenda a entrega. Mantém o status do agendamento.' })
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.reschedule(id, dto, actor));
  }

  @Post('confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirma o agendamento. Não altera o status da OV.' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.confirm(id, actor));
  }
}
