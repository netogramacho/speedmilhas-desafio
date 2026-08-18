import type { CreateOrderInput, OrderErrorField, OrderResponseBody } from './types';

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: OrderErrorField[];
  };
}

export class CreateOrderError extends Error {
  code: string;
  fields?: OrderErrorField[];

  constructor(code: string, message: string, fields?: OrderErrorField[]) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

export async function createOrder(input: CreateOrderInput): Promise<OrderResponseBody> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;

    throw new CreateOrderError(
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? `POST /orders respondeu ${response.status}`,
      body?.error?.fields,
    );
  }

  return response.json() as Promise<OrderResponseBody>;
}
