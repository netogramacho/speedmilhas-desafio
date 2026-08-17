/**
 * Catálogo fixo de aeroportos suportados pelo desafio.
 *
 * Duplica `api/src/presentation/search/supported-airports.ts` — mesmo precedente de hardcode da
 * DSM-5: a lista é fixa/documentada no `README.md`, e o formulário precisa ficar disponível sem
 * depender de uma chamada de rede auxiliar para popular as opções.
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
