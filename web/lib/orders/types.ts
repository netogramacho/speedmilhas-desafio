export type OrderReservationStatus = 'idle' | 'editing' | 'submitting' | 'error' | 'reserved';

export interface OrderFieldErrors {
  name?: 'required';
  document?: 'required' | 'invalidCpf';
}

export interface OrderReservationState {
  status: OrderReservationStatus;
  name: string;
  document: string;
  fieldErrors: OrderFieldErrors;
  errorCode?: string;
  orderId?: string;
}

export interface OrderErrorField {
  field: string;
  code: string;
  message: string;
}

export interface CreateOrderInput {
  quoteId: string;
  idempotencyKey: string;
  passenger: { name: string; document: string };
  quote: { miles: number; taxesBrl: number; carrier: string };
}

export interface OrderResponseBody {
  id: string;
  status: 'PENDING' | 'CONFIRMED';
  quoteId: string;
  quote: { miles: number; taxesBrl: number; carrier: string };
  passenger: { name: string; document: string };
  createdAt: string;
}
