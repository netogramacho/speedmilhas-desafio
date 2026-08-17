import { ValidationArguments } from 'class-validator';

import { IsValidCpf } from './is-valid-cpf.validator';

describe('IsValidCpf', () => {
  const validator = new IsValidCpf();

  it('CPF válido conhecido: validate() retorna true', () => {
    expect(validator.validate('52998224725')).toBe(true);
  });

  it('mesmo CPF com o 1º dígito verificador trocado: false', () => {
    expect(validator.validate('52998224735')).toBe(false);
  });

  it('mesmo CPF com o 2º dígito verificador trocado: false', () => {
    expect(validator.validate('52998224726')).toBe(false);
  });

  it('sequência de dígitos repetidos (00000000000): false, mesmo passando no checksum ingênuo', () => {
    expect(validator.validate('00000000000')).toBe(false);
  });

  it('sequência de dígitos repetidos (11111111111): false', () => {
    expect(validator.validate('11111111111')).toBe(false);
  });

  it('menos de 11 dígitos: false', () => {
    expect(validator.validate('123456789')).toBe(false);
  });

  it('mais de 11 dígitos: false', () => {
    expect(validator.validate('123456789012')).toBe(false);
  });

  it('caracteres não numéricos / CPF mascarado: false (sem strip de máscara)', () => {
    expect(validator.validate('123.456.789-00')).toBe(false);
  });

  it('valor não-string (número): false', () => {
    expect(validator.validate(123)).toBe(false);
  });

  it('valor não-string (null): false', () => {
    expect(validator.validate(null)).toBe(false);
  });

  it('valor não-string (undefined): false', () => {
    expect(validator.validate(undefined)).toBe(false);
  });

  it('defaultMessage() menciona o nome da propriedade e "CPF válido"', () => {
    const message = validator.defaultMessage({
      property: 'document',
    } as ValidationArguments);

    expect(message).toBe('document deve ser um CPF válido');
  });
});
