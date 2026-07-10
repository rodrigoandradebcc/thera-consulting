import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  findAll(): Promise<Customer[]> {
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<Customer | null> {
    return tx.customer.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async isTransportAuthorized(
    customerId: string,
    transportTypeId: string,
    tx: Tx = this.prisma,
  ): Promise<boolean> {
    const link = await tx.customerTransportType.findUnique({
      where: { customerId_transportTypeId: { customerId, transportTypeId } },
    });
    return link !== null;
  }

  async linkTransportTypes(customerId: string, transportTypeIds: string[]): Promise<void> {
    await this.prisma.customerTransportType.createMany({
      data: transportTypeIds.map((transportTypeId) => ({ customerId, transportTypeId })),
      skipDuplicates: true,
    });
  }

  async listTransportTypeIds(customerId: string): Promise<string[]> {
    const links = await this.prisma.customerTransportType.findMany({
      where: { customerId },
      select: { transportTypeId: true },
    });
    return links.map((link) => link.transportTypeId);
  }
}
