/**
 * Mapeia a chave de constraint violada do `class-validator` (`ValidationError.constraints`) para
 * um código estável, consumível pelo frontend sem depender do texto da mensagem em pt-BR — decisão
 * já fixada em `parametros-tecnicos.md`, item 15 ("respostas de erro/validação expostas ao cliente
 * carregam um código/chave estável").
 *
 * Não precisa ser exaustivo: qualquer chave ausente aqui cai no fallback
 * (`constraintKey.toUpperCase()`), aplicado por quem consome este mapa
 * (`validation-exception-factory.ts`).
 */
export const CONSTRAINT_ERROR_CODES: Record<string, string> = {
  isIn: 'AIRPORT_NOT_SUPPORTED',
  matches: 'INVALID_DATE_FORMAT',
  isDifferentFrom: 'ORIGIN_EQUALS_DESTINATION',
  isValidCalendarDate: 'INVALID_DATE',
  isNotEmpty: 'FIELD_REQUIRED',
  isString: 'FIELD_REQUIRED',
};
