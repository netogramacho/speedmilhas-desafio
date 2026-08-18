import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test/render-with-intl';
import { SearchForm } from './SearchForm';

describe('SearchForm', () => {
  it('submete com os 3 campos preenchidos → onSubmit chamado com os valores exatos', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<SearchForm onSubmit={onSubmit} disabled={false} />);

    await user.selectOptions(screen.getByLabelText('Origem'), 'GRU');
    await user.selectOptions(screen.getByLabelText('Destino'), 'GIG');
    await user.type(screen.getByLabelText('Data'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      origin: 'GRU',
      destination: 'GIG',
      date: '2026-09-01',
    });
  });

  it('origin vazio → onSubmit não chamado, mensagem de erro visível', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<SearchForm onSubmit={onSubmit} disabled={false} />);

    await user.selectOptions(screen.getByLabelText('Destino'), 'GIG');
    await user.type(screen.getByLabelText('Data'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Selecione a origem.')).toBeInTheDocument();
  });

  it('destination vazio → onSubmit não chamado, mensagem de erro visível', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<SearchForm onSubmit={onSubmit} disabled={false} />);

    await user.selectOptions(screen.getByLabelText('Origem'), 'GRU');
    await user.type(screen.getByLabelText('Data'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Selecione o destino.')).toBeInTheDocument();
  });

  it('date vazio → onSubmit não chamado, mensagem de erro visível', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<SearchForm onSubmit={onSubmit} disabled={false} />);

    await user.selectOptions(screen.getByLabelText('Origem'), 'GRU');
    await user.selectOptions(screen.getByLabelText('Destino'), 'GIG');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Selecione a data.')).toBeInTheDocument();
  });

  it('disabled=true desabilita o botão e os 3 campos', () => {
    renderWithIntl(<SearchForm onSubmit={vi.fn()} disabled />);

    expect(screen.getByLabelText('Origem')).toBeDisabled();
    expect(screen.getByLabelText('Destino')).toBeDisabled();
    expect(screen.getByLabelText('Data')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Buscando...' })).toBeDisabled();
  });
});
