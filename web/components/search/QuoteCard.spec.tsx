import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test/render-with-intl';
import { QuoteCard } from './QuoteCard';
import { formatCurrencyBrl, formatMiles } from '@/lib/format/number';
import { createOrder } from '@/lib/orders/api';
import type { SearchResponseQuote } from '@/lib/search/api';

vi.mock('@/lib/orders/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders/api')>('@/lib/orders/api');
  return {
    ...actual,
    createOrder: vi.fn(),
  };
});

const createOrderMock = vi.mocked(createOrder);

const quote: SearchResponseQuote = { miles: 18500, taxesBrl: 75.51, carrier: 'LATAM' };

describe('QuoteCard', () => {
  it('isBestOffer true → badge "Melhor oferta" visível', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer />);

    expect(screen.getByText('Melhor oferta')).toBeInTheDocument();
  });

  it('isBestOffer false → badge "Melhor oferta" ausente', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    expect(screen.queryByText('Melhor oferta')).not.toBeInTheDocument();
  });

  it('renderiza milhas formatadas e o rótulo "milhas" como nó de texto separado', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    expect(screen.getByText(formatMiles(quote.miles))).toBeInTheDocument();
    expect(screen.getByText('milhas')).toBeInTheDocument();
  });

  it('renderiza a taxa formatada em BRL', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    // Testing Library normaliza espaços (inclusive non-breaking space) do DOM antes de comparar.
    const expectedTaxes = `+ ${formatCurrencyBrl(quote.taxesBrl)} de taxas`.replace(/\s+/g, ' ');
    expect(screen.getByText(expectedTaxes)).toBeInTheDocument();
  });

  it('renderiza a companhia aérea', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    expect(screen.getByText(`Companhia: ${quote.carrier}`)).toBeInTheDocument();
  });

  it('estado inicial → botão "Reservar" visível, formulário não visível', () => {
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    expect(screen.getByRole('button', { name: 'Reservar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
  });

  it('clicar em "Reservar" → campos Nome completo/CPF aparecem, botão "Reservar" some', async () => {
    const user = userEvent.setup();
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    await user.click(screen.getByRole('button', { name: 'Reservar' }));

    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument();
  });

  it('confirmar com campos vazios → mensagens de erro inline visíveis, createOrder não chamado', async () => {
    const user = userEvent.setup();
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    await user.click(screen.getByRole('button', { name: 'Reservar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

    expect(screen.getByText('Informe o nome do passageiro.')).toBeInTheDocument();
    expect(screen.getByText('Informe o CPF do passageiro.')).toBeInTheDocument();
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('preencher nome + CPF válido, confirmar, createOrder resolvendo → mostra "Reservado" e o orderId', async () => {
    createOrderMock.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      quoteId: 'LATAM-18500-75.51',
      quote,
      passenger: { name: 'Maria da Silva', document: '52998224725' },
      createdAt: '2026-08-17T00:00:00.000Z',
    });

    const user = userEvent.setup();
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    await user.click(screen.getByRole('button', { name: 'Reservar' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Maria da Silva');
    await user.type(screen.getByLabelText('CPF'), '52998224725');
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

    await waitFor(() => {
      expect(screen.getByText('Reservado')).toBeInTheDocument();
    });
    expect(screen.getByText('Pedido order-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
  });

  it('preencher nome + CPF válido, confirmar, createOrder rejeitando → mostra erro do card mantendo os dados digitados', async () => {
    const { CreateOrderError } = await import('@/lib/orders/api');
    createOrderMock.mockRejectedValueOnce(new CreateOrderError('INTERNAL_ERROR', 'falhou'));

    const user = userEvent.setup();
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    await user.click(screen.getByRole('button', { name: 'Reservar' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Maria da Silva');
    await user.type(screen.getByLabelText('CPF'), '52998224725');
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível concluir a reserva agora. Tente novamente.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria da Silva');
    expect(screen.getByLabelText('CPF')).toHaveValue('52998224725');
    expect(screen.getByText(`Companhia: ${quote.carrier}`)).toBeInTheDocument();
  });

  it('clicar em "Cancelar" a partir do formulário aberto → volta a mostrar só o botão "Reservar", campos limpos', async () => {
    const user = userEvent.setup();
    renderWithIntl(<QuoteCard quote={quote} isBestOffer={false} />);

    await user.click(screen.getByRole('button', { name: 'Reservar' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Maria da Silva');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Reservar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
  });
});
