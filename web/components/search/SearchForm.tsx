'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { SUPPORTED_AIRPORTS } from '@/lib/search/supported-airports';
import type { SearchFormValues } from '@/lib/search/types';

export interface SearchFormProps {
  onSubmit: (values: SearchFormValues) => void;
  disabled: boolean;
}

interface FormErrors {
  origin?: string;
  destination?: string;
  date?: string;
}

export function SearchForm({ onSubmit, disabled }: SearchFormProps) {
  const t = useTranslations('search.form');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!origin) {
      nextErrors.origin = t('errors.originRequired');
    }
    if (!destination) {
      nextErrors.destination = t('errors.destinationRequired');
    }
    if (!date) {
      nextErrors.date = t('errors.dateRequired');
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({ origin, destination, date });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <div className="mt-4">
        <label htmlFor="origin" className="block font-medium">
          {t('origin')}
        </label>
        <select
          id="origin"
          value={origin}
          disabled={disabled}
          onChange={(event) => setOrigin(event.target.value)}
          className="mt-1 rounded-md border border-slate-300 p-2"
        >
          <option value="" disabled>
            {t('selectPlaceholder')}
          </option>
          {SUPPORTED_AIRPORTS.map((airport) => (
            <option key={airport} value={airport}>
              {airport}
            </option>
          ))}
        </select>
        {errors.origin && <p className="mt-1 text-red-700">{errors.origin}</p>}
      </div>

      <div className="mt-4">
        <label htmlFor="destination" className="block font-medium">
          {t('destination')}
        </label>
        <select
          id="destination"
          value={destination}
          disabled={disabled}
          onChange={(event) => setDestination(event.target.value)}
          className="mt-1 rounded-md border border-slate-300 p-2"
        >
          <option value="" disabled>
            {t('selectPlaceholder')}
          </option>
          {SUPPORTED_AIRPORTS.map((airport) => (
            <option key={airport} value={airport}>
              {airport}
            </option>
          ))}
        </select>
        {errors.destination && <p className="mt-1 text-red-700">{errors.destination}</p>}
      </div>

      <div className="mt-4">
        <label htmlFor="date" className="block font-medium">
          {t('date')}
        </label>
        <input
          id="date"
          type="date"
          value={date}
          disabled={disabled}
          onChange={(event) => setDate(event.target.value)}
          className="mt-1 rounded-md border border-slate-300 p-2"
        />
        {errors.date && <p className="mt-1 text-red-700">{errors.date}</p>}
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {disabled ? t('submitLoading') : t('submit')}
      </button>
    </form>
  );
}
