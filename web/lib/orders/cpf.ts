const CPF_PATTERN = /^\d{11}$/;
const REPEATED_DIGITS_PATTERN = /^(\d)\1{10}$/;

function checkDigit(cpf: string, length: number): number {
  const weightStart = length + 1;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Number(cpf[i]) * (weightStart - i);
  }

  const remainder = (sum * 10) % 11;
  return remainder >= 10 ? 0 : remainder;
}

// Réplica de api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts, mantida em
// sincronia manualmente (sem código compartilhado entre api/ e web/).
export function isValidCpf(value: string): boolean {
  if (!CPF_PATTERN.test(value)) {
    return false;
  }

  if (REPEATED_DIGITS_PATTERN.test(value)) {
    return false;
  }

  const firstCheckDigit = checkDigit(value, 9);
  if (firstCheckDigit !== Number(value[9])) {
    return false;
  }

  const secondCheckDigit = checkDigit(value, 10);
  if (secondCheckDigit !== Number(value[10])) {
    return false;
  }

  return true;
}
