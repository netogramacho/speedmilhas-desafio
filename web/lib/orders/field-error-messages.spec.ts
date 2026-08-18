import { describe, expect, it } from 'vitest';
import { resolveFieldErrorMessageKey } from './field-error-messages';

describe('resolveFieldErrorMessageKey', () => {
  it("('name', 'required') → orders.form.errors.nameRequired", () => {
    expect(resolveFieldErrorMessageKey('name', 'required')).toBe('orders.form.errors.nameRequired');
  });

  it("('document', 'required') → orders.form.errors.documentRequired", () => {
    expect(resolveFieldErrorMessageKey('document', 'required')).toBe(
      'orders.form.errors.documentRequired',
    );
  });

  it("('document', 'invalidCpf') → orders.form.errors.documentInvalid", () => {
    expect(resolveFieldErrorMessageKey('document', 'invalidCpf')).toBe(
      'orders.form.errors.documentInvalid',
    );
  });
});
