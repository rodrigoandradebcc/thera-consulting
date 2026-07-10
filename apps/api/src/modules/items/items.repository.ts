import { Injectable } from '@nestjs/common';
import { Item, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ItemCreateInput): Promise<Item> {
    return this.prisma.item.create({ data });
  }

  findAll(): Promise<Item[]> {
    return this.prisma.item.findMany({ orderBy: { sku: 'asc' } });
  }

  findById(id: string): Promise<Item | null> {
    return this.prisma.item.findUnique({ where: { id } });
  }

  /** Uma query para N itens. É o que impede o N+1 na criação da OV. */
  findManyByIds(ids: string[], tx: Tx = this.prisma): Promise<Item[]> {
    return tx.item.findMany({ where: { id: { in: ids } } });
  }
}
