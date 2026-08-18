import { describe, expect, it } from 'vitest';
import { resolveOrderErrorMessageKey } from './error-messages';

describe('resolveOrderErrorMessageKey', () => {
  it('INVALID_CPF → orders.errors.invalidCpf', () => {
    expect(resolveOrderErrorMessageKey('INVALID_CPF')).toBe('orders.errors.invalidCpf');
  });

  it('FIELD_REQUIRED → orders.errors.fieldRequired', () => {
    expect(resolveOrderErrorMessageKey('FIELD_REQUIRED')).toBe('orders.errors.fieldRequired');
  });

  it('INVALID_QUOTE_VALUE → orders.errors.invalidQuote', () => {
    expect(resolveOrderErrorMessageKey('INVALID_QUOTE_VALUE')).toBe('orders.errors.invalidQuote');
  });

  it('NETWORK_ERROR → orders.errors.network', () => {
    expect(resolveOrderErrorMessageKey('NETWORK_ERROR')).toBe('orders.errors.network');
  });

  it('código desconhecido → orders.errors.generic', () => {
    expect(resolveOrderErrorMessageKey('SOMETHING_ELSE')).toBe('orders.errors.generic');
  });

  it('undefined → orders.errors.generic', () => {
    expect(resolveOrderErrorMessageKey(undefined)).toBe('orders.errors.generic');
  });
});
