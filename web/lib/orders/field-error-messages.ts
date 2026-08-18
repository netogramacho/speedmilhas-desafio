export function resolveFieldErrorMessageKey(
  field: 'name' | 'document',
  code: 'required' | 'invalidCpf',
): string {
  if (field === 'name') {
    return 'orders.form.errors.nameRequired';
  }

  return code === 'invalidCpf'
    ? 'orders.form.errors.documentInvalid'
    : 'orders.form.errors.documentRequired';
}
