import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test/render-with-intl';
import { SearchPage } from './SearchPage';
import { useSearch } from '@/hooks/use-search';

vi.mock('@/hooks/use-search', () => ({
  useSearch: vi.fn(),
}));

const useSearchMock = vi.mocked(useSearch);

describe('SearchPage', () => {
  it('submeter o formulário chama submit com os valores do formulário', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    useSearchMock.mockReturnValue({ uiState: { kind: 'idle' }, submit, retry: vi.fn() });

    renderWithIntl(<SearchPage />);

    await user.selectOptions(screen.getByLabelText('Origem'), 'GRU');
    await user.selectOptions(screen.getByLabelText('Destino'), 'GIG');
    await user.type(screen.getByLabelText('Data'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(submit).toHaveBeenCalledWith({ origin: 'GRU', destination: 'GIG', date: '2026-09-01' });
  });

  it('uiState loading → SearchForm recebe disabled=true', () => {
    useSearchMock.mockReturnValue({
      uiState: { kind: 'loading' },
      submit: vi.fn(),
      retry: vi.fn(),
    });

    renderWithIntl(<SearchPage />);

    expect(screen.getByLabelText('Origem')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Buscando...' })).toBeDisabled();
  });

  it('uiState error → clicar em "tentar novamente" chama retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    useSearchMock.mockReturnValue({ uiState: { kind: 'error' }, submit: vi.fn(), retry });

    renderWithIntl(<SearchPage />);

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
