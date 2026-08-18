const milesFormatter = new Intl.NumberFormat('pt-BR');
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMiles(miles: number): string {
  return milesFormatter.format(miles);
}

export function formatCurrencyBrl(valueBrl: number): string {
  return currencyFormatter.format(valueBrl);
}
