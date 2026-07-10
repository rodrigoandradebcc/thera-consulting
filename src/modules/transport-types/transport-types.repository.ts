import { Injectable } from '@nestjs/common';
import { Prisma, TransportType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class TransportTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.TransportTypeCreateInput): Promise<TransportType> {
    return this.prisma.transportType.create({ data });
  }

  findAll(): Promise<TransportType[]> {
    return this.prisma.transportType.findMany({ orderBy: { code: 'asc' } });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<TransportType | null> {
    return tx.transportType.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.TransportTypeUpdateInput): Promise<TransportType> {
    return this.prisma.transportType.update({ where: { id }, data });
  }
}
