const ORDER_ERROR_MESSAGE_KEYS: Record<string, string> = {
  INVALID_CPF: 'orders.errors.invalidCpf',
  FIELD_REQUIRED: 'orders.errors.fieldRequired',
  INVALID_QUOTE_VALUE: 'orders.errors.invalidQuote',
  NETWORK_ERROR: 'orders.errors.network',
};

export function resolveOrderErrorMessageKey(code: string | undefined): string {
  if (!code) {
    return 'orders.errors.generic';
  }

  return ORDER_ERROR_MESSAGE_KEYS[code] ?? 'orders.errors.generic';
}
