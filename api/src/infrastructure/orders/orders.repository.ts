import { Injectable } from '@nestjs/common';

import { reaisToCents } from '../../domain/orders/money';
import { Prisma } from '../../generated/prisma/client';
import { isUniqueConstraintViolation } from '../prisma/prisma-error.util';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateOrderInput {
  quoteId: string;
  idempotencyKey: string;
  passenger: { name: string; document: string };
  quote: { miles: number; taxesBrl: number; carrier: string };
}

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { passenger: true; quoteSnapshot: true };
}>;

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGetExisting(
    input: CreateOrderInput,
  ): Promise<OrderWithRelations> {
    let created: OrderWithRelations;

    try {
      created = await this.prisma.order.create({
        data: {
          quoteId: input.quoteId,
          idempotencyKey: input.idempotencyKey,
          passenger: {
            create: {
              name: input.passenger.name,
              document: input.passenger.document,
            },
          },
          quoteSnapshot: {
            create: {
              miles: input.quote.miles,
              taxesBrlCents: reaisToCents(input.quote.taxesBrl),
              carrier: input.quote.carrier,
            },
          },
        },
        include: { passenger: true, quoteSnapshot: true },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error, 'idempotencyKey')) {
        throw error;
      }

      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { passenger: true, quoteSnapshot: true },
      });

      if (!existing) {
        throw error;
      }

      return existing;
    }

    return this.prisma.order.update({
      where: { id: created.id },
      data: { status: 'CONFIRMED' },
      include: { passenger: true, quoteSnapshot: true },
    });
  }
}
