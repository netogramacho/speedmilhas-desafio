'use client';

import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { formatCurrencyBrl, formatMiles } from '@/lib/format/number';
import { resolveFieldErrorMessageKey } from '@/lib/orders/field-error-messages';
import { resolveOrderErrorMessageKey } from '@/lib/orders/error-messages';
import { useOrderReservation } from '@/hooks/use-order-reservation';
import type { SearchResponseQuote } from '@/lib/search/api';

export interface QuoteCardProps {
  quote: SearchResponseQuote;
  isBestOffer: boolean;
}

export function QuoteCard({ quote, isBestOffer }: QuoteCardProps) {
  const t = useTranslations('search.quote');
  const tOrders = useTranslations('orders');
  // resolveOrderErrorMessageKey/resolveFieldErrorMessageKey já devolvem a chave completa a partir
  // da raiz (ex. "orders.errors.generic"), então essas duas usam o tradutor sem namespace.
  const tRoot = useTranslations();
  const { quoteId, state, openForm, cancel, setName, setDocument, confirm } =
    useOrderReservation(quote);

  const nameFieldId = `passenger-name-${quoteId}`;
  const documentFieldId = `passenger-document-${quoteId}`;
  const nameErrorId = `${nameFieldId}-error`;
  const documentErrorId = `${documentFieldId}-error`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    confirm();
  }

  return (
    <li
      className={
        isBestOffer
          ? 'rounded-md border-2 border-emerald-400 bg-emerald-50 p-4'
          : 'rounded-md border border-slate-200 p-4'
      }
    >
      {isBestOffer && (
        <span className="mb-2 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
          {t('bestOffer')}
        </span>
      )}
      <p className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900">{formatMiles(quote.miles)}</span>
        <span className="text-base font-normal text-slate-500">{t('milesLabel')}</span>
      </p>
      <p className="mt-1 text-slate-600">{t('carrier', { carrier: quote.carrier })}</p>
      <p className="text-slate-600">{t('taxes', { taxes: formatCurrencyBrl(quote.taxesBrl) })}</p>

      {state.status === 'idle' && (
        <button
          type="button"
          onClick={openForm}
          className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-white"
        >
          {tOrders('reserveButton')}
        </button>
      )}

      {state.status === 'reserved' && (
        <div className="mt-3 rounded-md bg-emerald-100 p-3 text-emerald-800">
          <p className="font-semibold">{tOrders('states.reserved')}</p>
          <p>{tOrders('states.reservedOrderId', { orderId: state.orderId ?? '' })}</p>
        </div>
      )}

      {(state.status === 'editing' || state.status === 'submitting' || state.status === 'error') && (
        <form onSubmit={handleSubmit} noValidate className="mt-3">
          {state.status === 'error' && (
            <p className="mb-2 rounded-md bg-red-50 p-2 text-red-700">
              {tRoot(resolveOrderErrorMessageKey(state.errorCode))}
            </p>
          )}

          <div>
            <label htmlFor={nameFieldId} className="block font-medium">
              {tOrders('form.name')}
            </label>
            <input
              id={nameFieldId}
              type="text"
              value={state.name}
              disabled={state.status === 'submitting'}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.name)}
              aria-describedby={state.fieldErrors.name ? nameErrorId : undefined}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 disabled:bg-slate-50 disabled:opacity-50"
            />
            <div className="mt-1 min-h-[1.25rem]">
              {state.fieldErrors.name && (
                <p id={nameErrorId} className="text-red-700">
                  {tRoot(resolveFieldErrorMessageKey('name', state.fieldErrors.name))}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2">
            <label htmlFor={documentFieldId} className="block font-medium">
              {tOrders('form.document')}
            </label>
            <input
              id={documentFieldId}
              type="text"
              inputMode="numeric"
              value={state.document}
              disabled={state.status === 'submitting'}
              onChange={(event) => setDocument(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.document)}
              aria-describedby={state.fieldErrors.document ? documentErrorId : undefined}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 disabled:bg-slate-50 disabled:opacity-50"
            />
            <div className="mt-1 min-h-[1.25rem]">
              {state.fieldErrors.document && (
                <p id={documentErrorId} className="text-red-700">
                  {tRoot(resolveFieldErrorMessageKey('document', state.fieldErrors.document))}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={state.status === 'submitting'}
              className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {state.status === 'submitting'
                ? tOrders('form.confirming')
                : state.status === 'error'
                  ? tOrders('form.retry')
                  : tOrders('form.confirm')}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={state.status === 'submitting'}
              className="rounded-md border border-slate-300 px-4 py-2 disabled:opacity-50"
            >
              {tOrders('form.cancel')}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
