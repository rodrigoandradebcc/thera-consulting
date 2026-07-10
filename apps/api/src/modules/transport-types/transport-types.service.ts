import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, TransportType } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CreateTransportTypeDto } from './dto/create-transport-type.dto';
import { UpdateTransportTypeDto } from './dto/update-transport-type.dto';
import { TransportTypesRepository } from './transport-types.repository';

@Injectable()
export class TransportTypesService {
  constructor(private readonly repository: TransportTypesRepository) {}

  async create(dto: CreateTransportTypeDto): Promise<TransportType> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um tipo de transporte com o código ${dto.code}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<TransportType[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<TransportType> {
    const transportType = await this.repository.findById(id);
    if (transportType === null) {
      throw new EntityNotFoundException('TipoTransporte', id);
    }
    return transportType;
  }

  async update(id: string, dto: UpdateTransportTypeDto): Promise<TransportType> {
    await this.findByIdOrThrow(id);
    return this.repository.update(id, dto);
  }
}
