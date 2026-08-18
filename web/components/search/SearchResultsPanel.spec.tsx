import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test/render-with-intl';
import { SearchResultsPanel } from './SearchResultsPanel';
import { formatMiles } from '@/lib/format/number';
import type { SearchUiState } from '@/lib/search/types';

describe('SearchResultsPanel', () => {
  it('idle → nada renderizado', () => {
    const { container } = renderWithIntl(
      <SearchResultsPanel state={{ kind: 'idle' }} onRetry={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('loading → skeleton visível', () => {
    renderWithIntl(<SearchResultsPanel state={{ kind: 'loading' }} onRetry={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('success → lista com as cotações, sem aviso de parcial', () => {
    const state: SearchUiState = {
      kind: 'success',
      quotes: [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }],
    };

    renderWithIntl(<SearchResultsPanel state={state} onRetry={vi.fn()} />);

    expect(screen.getByText(formatMiles(1000))).toBeInTheDocument();
    expect(screen.getByText('milhas')).toBeInTheDocument();
    expect(screen.getByText('Melhor oferta')).toBeInTheDocument();
    expect(
      screen.queryByText('Nem todos os fornecedores responderam a tempo.'),
    ).not.toBeInTheDocument();
  });

  it('partial com cotações → aviso de parcial visível e lista com as cotações', () => {
    const state: SearchUiState = {
      kind: 'partial',
      quotes: [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }],
      missingSuppliers: ['supplier-b'],
    };

    renderWithIntl(<SearchResultsPanel state={state} onRetry={vi.fn()} />);

    expect(screen.getByText('Nem todos os fornecedores responderam a tempo.')).toBeInTheDocument();
    expect(screen.getByText('Fornecedor B')).toBeInTheDocument();
    expect(screen.getByText(formatMiles(1000))).toBeInTheDocument();
  });

  it('partial com quotes vazio → aviso de parcial e mensagem de "não encontramos cotações", sem lista', () => {
    const state: SearchUiState = {
      kind: 'partial',
      quotes: [],
      missingSuppliers: ['supplier-b'],
    };

    renderWithIntl(<SearchResultsPanel state={state} onRetry={vi.fn()} />);

    expect(screen.getByText('Nem todos os fornecedores responderam a tempo.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Não encontramos cotações para esse destino com os fornecedores que responderam.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/milhas/)).not.toBeInTheDocument();
  });

  it('empty → mensagem de nenhum resultado, sem aviso de parcial, sem lista', () => {
    renderWithIntl(<SearchResultsPanel state={{ kind: 'empty' }} onRetry={vi.fn()} />);

    expect(
      screen.getByText('Nenhum resultado encontrado para essa rota e data.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Nem todos os fornecedores responderam a tempo.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('error → mensagem de erro + botão "tentar novamente" que chama onRetry ao clicar', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithIntl(<SearchResultsPanel state={{ kind: 'error' }} onRetry={onRetry} />);

    expect(screen.getByText('Não foi possível buscar as cotações agora.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
