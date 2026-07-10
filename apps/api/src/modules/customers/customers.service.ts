import { ConflictException, Injectable } from '@nestjs/common';
import { Customer, Prisma } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      // P2002 = violação de unique. Traduzir o código do Prisma aqui evita
      // que o resto do sistema conheça o vocabulário do ORM.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um cliente com o documento ${dto.document}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<Customer[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<Customer> {
    const customer = await this.repository.findById(id);
    if (customer === null) {
      throw new EntityNotFoundException('Cliente', id);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findByIdOrThrow(id);
    return this.repository.update(id, dto);
  }

  async linkTransportTypes(id: string, transportTypeIds: string[]): Promise<string[]> {
    await this.findByIdOrThrow(id);
    try {
      await this.repository.linkTransportTypes(id, transportTypeIds);
    } catch (error) {
      // P2003 = violação de foreign key: algum transportTypeId não existe.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new EntityNotFoundException('TipoTransporte', transportTypeIds.join(', '));
      }
      throw error;
    }
    return this.repository.listTransportTypeIds(id);
  }

  async listTransportTypes(id: string): Promise<string[]> {
    await this.findByIdOrThrow(id);
    return this.repository.listTransportTypeIds(id);
  }
}
