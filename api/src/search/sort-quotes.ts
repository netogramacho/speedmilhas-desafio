import { Quote } from '../suppliers/types';

/**
 * Ordena cotações por miles ascendente; em empate, por taxesBrl ascendente (menor custo total).
 * Função pura: não muta o array recebido.
 */
export function sortQuotes(quotes: Quote[]): Quote[] {
  return [...quotes].sort(
    (a, b) => a.miles - b.miles || a.taxesBrl - b.taxesBrl,
  );
}
