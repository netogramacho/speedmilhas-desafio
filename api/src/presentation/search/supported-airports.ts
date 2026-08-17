/**
 * Catálogo fixo de aeroportos suportados pelo desafio.
 *
 * Origem: `README.md` e `mock-suppliers/src/index.js:31` (`AIRPORTS`) — arquivo que a regra do
 * desafio proíbe alterar, mas não proíbe ler/copiar a lista fixa dele. Constante estática (não
 * buscada em runtime via `GET /` do mock) para a validação de entrada continuar síncrona e sem
 * depender de rede — ver `claude/specs/DSM-5/spec.md`, "Arquitetura decidida".
 */
export const SUPPORTED_AIRPORTS = [
  'GRU',
  'GIG',
  'BSB',
  'SSA',
  'REC',
  'POA',
  'CNF',
  'FOR',
] as const;

export type SupportedAirport = (typeof SUPPORTED_AIRPORTS)[number];
