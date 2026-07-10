import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient | PrismaService;
