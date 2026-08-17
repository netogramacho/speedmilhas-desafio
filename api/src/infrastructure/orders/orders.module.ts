import { Module } from '@nestjs/common';

import { OrdersController } from '../../presentation/orders/orders.controller';
import { OrdersRepository } from './orders.repository';

@Module({
  controllers: [OrdersController],
  providers: [OrdersRepository],
})
export class OrdersModule {}
