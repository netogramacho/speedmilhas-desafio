'use client';

import { useTranslations } from 'next-intl';
import type { SupplierId } from '@/lib/search/types';

export interface PartialWarningBannerProps {
  missingSuppliers: SupplierId[];
}

export function PartialWarningBanner({ missingSuppliers }: PartialWarningBannerProps) {
  const t = useTranslations('search');

  return (
    <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="flex items-start gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>{t('states.partialWarning')}</span>
      </p>
      <ul className="mt-2 list-disc pl-5">
        {missingSuppliers.map((supplierId) => (
          <li key={supplierId}>{t(`suppliers.${supplierId}`)}</li>
        ))}
      </ul>
    </div>
  );
}
