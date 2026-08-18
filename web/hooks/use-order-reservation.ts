import { useCallback, useMemo, useRef, useState } from 'react';
import { createOrder, CreateOrderError } from '@/lib/orders/api';
import { isValidCpf } from '@/lib/orders/cpf';
import { buildQuoteId } from '@/lib/orders/quote-id';
import type { OrderFieldErrors, OrderReservationState } from '@/lib/orders/types';
import type { SearchResponseQuote } from '@/lib/search/api';

export interface UseOrderReservationResult {
  quoteId: string;
  state: OrderReservationState;
  openForm: () => void;
  cancel: () => void;
  setName: (name: string) => void;
  setDocument: (document: string) => void;
  confirm: () => void;
}

const INITIAL_STATE: OrderReservationState = {
  status: 'idle',
  name: '',
  document: '',
  fieldErrors: {},
};

function fieldErrorFromCode(code: string): 'required' | 'invalidCpf' {
  return code === 'INVALID_CPF' ? 'invalidCpf' : 'required';
}

export function useOrderReservation(quote: SearchResponseQuote): UseOrderReservationResult {
  const quoteId = useMemo(() => buildQuoteId(quote), [quote]);
  const [state, setState] = useState<OrderReservationState>(INITIAL_STATE);
  const idempotencyKeyRef = useRef<string | null>(null);

  const openForm = useCallback(() => {
    if (state.status !== 'idle') {
      return;
    }
    setState((previous) => ({ ...previous, status: 'editing' }));
  }, [state.status]);

  const cancel = useCallback(() => {
    if (state.status === 'submitting') {
      return;
    }
    idempotencyKeyRef.current = null;
    setState(INITIAL_STATE);
  }, [state.status]);

  const setName = useCallback(
    (name: string) => {
      if (state.status !== 'editing' && state.status !== 'error') {
        return;
      }

      setState((previous) => ({
        ...previous,
        name,
        status: 'editing',
        errorCode: undefined,
        fieldErrors: { ...previous.fieldErrors, name: undefined },
      }));
    },
    [state.status],
  );

  const setDocument = useCallback(
    (document: string) => {
      if (state.status !== 'editing' && state.status !== 'error') {
        return;
      }

      const digitsOnly = document.replace(/\D/g, '');

      setState((previous) => ({
        ...previous,
        document: digitsOnly,
        status: 'editing',
        errorCode: undefined,
        fieldErrors: { ...previous.fieldErrors, document: undefined },
      }));
    },
    [state.status],
  );

  const confirm = useCallback(() => {
    if (state.status !== 'editing' && state.status !== 'error') {
      return;
    }

    const fieldErrors: OrderFieldErrors = {};
    if (!state.name.trim()) {
      fieldErrors.name = 'required';
    }
    if (!state.document) {
      fieldErrors.document = 'required';
    } else if (!isValidCpf(state.document)) {
      fieldErrors.document = 'invalidCpf';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setState((previous) => ({ ...previous, status: 'editing', fieldErrors }));
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const name = state.name.trim();
    const { document } = state;

    setState((previous) => ({
      ...previous,
      status: 'submitting',
      fieldErrors: {},
      errorCode: undefined,
    }));

    createOrder({
      quoteId,
      idempotencyKey,
      passenger: { name, document },
      quote,
    })
      .then((order) => {
        setState((previous) => ({ ...previous, status: 'reserved', orderId: order.id }));
      })
      .catch((error: unknown) => {
        if (error instanceof CreateOrderError) {
          const nameError = error.fields?.find((field) => field.field === 'passenger.name');
          const documentError = error.fields?.find(
            (field) => field.field === 'passenger.document',
          );

          if (nameError || documentError) {
            setState((previous) => ({
              ...previous,
              status: 'editing',
              fieldErrors: {
                // `passenger.name` só tem validação de "obrigatório" no backend (sem checagem de
                // formato), então o único código possível ali é FIELD_REQUIRED.
                ...(nameError ? { name: 'required' as const } : {}),
                ...(documentError ? { document: fieldErrorFromCode(documentError.code) } : {}),
              },
            }));
            return;
          }

          setState((previous) => ({
            ...previous,
            status: 'error',
            errorCode: error.fields?.[0]?.code ?? error.code,
          }));
          return;
        }

        setState((previous) => ({ ...previous, status: 'error', errorCode: 'NETWORK_ERROR' }));
      });
  }, [state, quote, quoteId]);

  return { quoteId, state, openForm, cancel, setName, setDocument, confirm };
}
