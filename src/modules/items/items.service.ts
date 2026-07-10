import { ConflictException, Injectable } from '@nestjs/common';
import { Item, Prisma } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CreateItemDto } from './dto/create-item.dto';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
  constructor(private readonly repository: ItemsRepository) {}

  async create(dto: CreateItemDto): Promise<Item> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um item com o SKU ${dto.sku}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<Item[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<Item> {
    const item = await this.repository.findById(id);
    if (item === null) {
      throw new EntityNotFoundException('Item', id);
    }
    return item;
  }
}
