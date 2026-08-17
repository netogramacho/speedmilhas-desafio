import { centsToReais } from '../../domain/orders/money';
import { OrderWithRelations } from '../../infrastructure/orders/orders.repository';
import { OrderResponseDto } from './dto/order-response.dto';

export function mapOrderToResponse(
  order: OrderWithRelations,
): OrderResponseDto {
  return {
    id: order.id,
    status: order.status,
    quoteId: order.quoteId,
    quote: {
      miles: order.quoteSnapshot.miles,
      taxesBrl: centsToReais(order.quoteSnapshot.taxesBrlCents),
      carrier: order.quoteSnapshot.carrier,
    },
    passenger: {
      name: order.passenger.name,
      document: order.passenger.document,
    },
    createdAt: order.createdAt.toISOString(),
  };
}
