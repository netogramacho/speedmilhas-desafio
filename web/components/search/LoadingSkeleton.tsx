'use client';

import { useTranslations } from 'next-intl';

export function LoadingSkeleton() {
  const t = useTranslations('search');

  return (
    <div role="status" aria-label={t('states.loading')} className="mt-6 space-y-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-16 animate-pulse rounded-md bg-slate-200" />
      ))}
    </div>
  );
}
