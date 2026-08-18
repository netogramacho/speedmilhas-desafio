import { describe, expect, it } from 'vitest';
import { isValidCpf } from './cpf';

describe('isValidCpf', () => {
  it('CPF válido conhecido → true', () => {
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('CPF com dígito verificador errado → false', () => {
    expect(isValidCpf('52998224735')).toBe(false);
  });

  it('menos de 11 dígitos → false', () => {
    expect(isValidCpf('123456789')).toBe(false);
  });

  it('mais de 11 dígitos → false', () => {
    expect(isValidCpf('123456789012')).toBe(false);
  });

  it('sequência repetida (11111111111) → false, mesmo passando no cálculo de dígito verificador', () => {
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('sequência repetida (00000000000) → false', () => {
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it('string com caracteres não numéricos → false (sem strip)', () => {
    expect(isValidCpf('529.982.247-25')).toBe(false);
  });
});
