import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/pt-BR.json';
import './globals.css';

export const metadata = {
  title: 'Speed Milhas — Desafio Técnico',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* now/timeZone/formats explícitos: sem eles, o provider no server tenta resolvê-los via `next-intl/config`, que só existe com o plugin do next-intl (não usado aqui) e quebra o build. */}
        <NextIntlClientProvider
          locale="pt-BR"
          messages={messages}
          now={new Date()}
          timeZone="America/Sao_Paulo"
          formats={{}}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
