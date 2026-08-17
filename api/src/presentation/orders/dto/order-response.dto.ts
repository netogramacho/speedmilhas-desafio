export interface OrderResponseDto {
  id: string;
  status: 'PENDING' | 'CONFIRMED';
  quoteId: string;
  quote: { miles: number; taxesBrl: number; carrier: string };
  passenger: { name: string; document: string };
  createdAt: string;
}
