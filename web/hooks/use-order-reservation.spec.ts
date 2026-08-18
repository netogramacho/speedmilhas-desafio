import { act, renderHook, waitFor } from '@testing-library/react';
import type { RenderHookResult } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderReservation, type UseOrderReservationResult } from './use-order-reservation';
import { createOrder, CreateOrderError } from '@/lib/orders/api';
import type { SearchResponseQuote } from '@/lib/search/api';

vi.mock('@/lib/orders/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders/api')>('@/lib/orders/api');
  return {
    ...actual,
    createOrder: vi.fn(),
  };
});

const createOrderMock = vi.mocked(createOrder);

const quote: SearchResponseQuote = { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' };

// Cada setter só reflete o status mais recente na próxima chamada depois que o act() anterior
// terminar de "commitar" — chamadas empilhadas no mesmo act() leem `state` do closure antigo do
// hook (antes de qualquer uma delas ter efeito), então cada passo do formulário precisa do seu
// próprio act().
function fillForm(
  result: RenderHookResult<UseOrderReservationResult, unknown>['result'],
  name: string,
  document: string,
) {
  act(() => {
    result.current.openForm();
  });
  act(() => {
    result.current.setName(name);
  });
  act(() => {
    result.current.setDocument(document);
  });
}

function mockOrderResponse(overrides: Partial<Awaited<ReturnType<typeof createOrder>>> = {}) {
  return {
    id: 'order-1',
    status: 'PENDING' as const,
    quoteId: 'GOL-18500-38.5',
    quote,
    passenger: { name: 'Maria da Silva', document: '52998224725' },
    createdAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('useOrderReservation', () => {
  beforeEach(() => {
    createOrderMock.mockReset();
  });

  it('estado inicial: status idle', () => {
    const { result } = renderHook(() => useOrderReservation(quote));
    expect(result.current.state.status).toBe('idle');
  });

  it('openForm() → status editing', () => {
    const { result } = renderHook(() => useOrderReservation(quote));

    act(() => {
      result.current.openForm();
    });

    expect(result.current.state.status).toBe('editing');
  });

  it('confirm() com name/document vazios → createOrder não chamado, fieldErrors com os dois campos', () => {
    const { result } = renderHook(() => useOrderReservation(quote));

    act(() => {
      result.current.openForm();
    });
    act(() => {
      result.current.confirm();
    });

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('editing');
    expect(result.current.state.fieldErrors).toEqual({ name: 'required', document: 'required' });
  });

  it('confirm() com document preenchido mas CPF inválido → createOrder não chamado, fieldErrors.document invalidCpf', () => {
    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '12345678900');
    act(() => {
      result.current.confirm();
    });

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(result.current.state.fieldErrors.document).toBe('invalidCpf');
  });

  it('confirm() válido → status passa por submitting antes de chegar a reserved com o orderId', async () => {
    createOrderMock.mockResolvedValueOnce(mockOrderResponse());

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    expect(result.current.state.status).toBe('submitting');

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });
    expect(result.current.state.orderId).toBe('order-1');
  });

  it('duas chamadas de confirm() (primeira falhando, retry depois) → createOrder chamado com o mesmo idempotencyKey nas duas', async () => {
    createOrderMock.mockRejectedValueOnce(new CreateOrderError('INTERNAL_ERROR', 'falhou'));
    createOrderMock.mockResolvedValueOnce(mockOrderResponse());

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });

    expect(createOrderMock).toHaveBeenCalledTimes(2);
    const firstKey = createOrderMock.mock.calls[0][0].idempotencyKey;
    const secondKey = createOrderMock.mock.calls[1][0].idempotencyKey;
    expect(secondKey).toBe(firstKey);
  });

  it('duas chamadas de confirm() na mesma janela de evento (duplo clique físico) → ambas chamam createOrder com a mesma idempotencyKey', async () => {
    createOrderMock.mockResolvedValue(mockOrderResponse());

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
      result.current.confirm();
    });

    expect(createOrderMock).toHaveBeenCalledTimes(2);
    const firstKey = createOrderMock.mock.calls[0][0].idempotencyKey;
    const secondKey = createOrderMock.mock.calls[1][0].idempotencyKey;
    expect(secondKey).toBe(firstKey);

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });
  });

  it('confirm() trima espaços do nome antes de enviar, mas aceita nome com espaços nas pontas na validação', async () => {
    createOrderMock.mockResolvedValueOnce(mockOrderResponse());

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, '  Maria da Silva  ', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });
    expect(createOrderMock.mock.calls[0][0].passenger.name).toBe('Maria da Silva');
  });

  it('createOrder rejeita com CreateOrderError com fields em passenger.document → volta para editing com fieldErrors.document', async () => {
    createOrderMock.mockRejectedValueOnce(
      new CreateOrderError('VALIDATION_ERROR', 'inválido', [
        { field: 'passenger.document', code: 'INVALID_CPF', message: 'CPF inválido' },
      ]),
    );

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('editing');
    });
    expect(result.current.state.fieldErrors.document).toBe('invalidCpf');
  });

  it('createOrder rejeita com CreateOrderError sem fields relevantes → status error, name/document preservados', async () => {
    createOrderMock.mockRejectedValueOnce(new CreateOrderError('INTERNAL_ERROR', 'falhou'));

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(result.current.state.name).toBe('Maria da Silva');
    expect(result.current.state.document).toBe('52998224725');
  });

  it('createOrder rejeita com erro que não é CreateOrderError → status error, errorCode NETWORK_ERROR', async () => {
    createOrderMock.mockRejectedValueOnce(new Error('falha de rede'));

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(result.current.state.errorCode).toBe('NETWORK_ERROR');
  });

  it('cancel() a partir de editing/error → volta para idle, campos zerados; confirm() após reabrir gera nova idempotencyKey', async () => {
    createOrderMock.mockRejectedValueOnce(new CreateOrderError('INTERNAL_ERROR', 'falhou'));
    createOrderMock.mockResolvedValueOnce(mockOrderResponse());

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    const firstKey = createOrderMock.mock.calls[0][0].idempotencyKey;

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      name: '',
      document: '',
      fieldErrors: {},
    });

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });

    const secondKey = createOrderMock.mock.calls[1][0].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });

  it('cancel() durante submitting → não tem efeito', async () => {
    let resolveCreateOrder: (value: Awaited<ReturnType<typeof createOrder>>) => void = () => {};
    createOrderMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreateOrder = resolve;
        }),
    );

    const { result } = renderHook(() => useOrderReservation(quote));

    fillForm(result, 'Maria da Silva', '52998224725');
    act(() => {
      result.current.confirm();
    });

    expect(result.current.state.status).toBe('submitting');

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state.status).toBe('submitting');

    act(() => {
      resolveCreateOrder(mockOrderResponse());
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('reserved');
    });
  });
});
