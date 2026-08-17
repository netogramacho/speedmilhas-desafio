import { Body, Controller, Post } from '@nestjs/common';

import { OrdersRepository } from '../../infrastructure/orders/orders.repository';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { mapOrderToResponse } from './order-response.mapper';

@Controller()
export class OrdersController {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  @Post('orders')
  async create(@Body() dto: CreateOrderRequestDto): Promise<OrderResponseDto> {
    const order = await this.ordersRepository.createOrGetExisting({
      quoteId: dto.quoteId,
      idempotencyKey: dto.idempotencyKey,
      passenger: { name: dto.passenger.name, document: dto.passenger.document },
      quote: {
        miles: dto.quote.miles,
        taxesBrl: dto.quote.taxesBrl,
        carrier: dto.quote.carrier,
      },
    });

    return mapOrderToResponse(order);
  }
}
