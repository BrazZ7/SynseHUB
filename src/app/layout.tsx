import type { Metadata, Viewport } from 'next'

import { APP } from '@/config/app'
import { ThemeScript } from '@/components/synse/theme-script'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(APP.url),
  title: {
    default: 'SynseHub — gestão para academias',
    template: '%s · SynseHub',
  },
  description:
    'Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema. SynseHub é o painel das academias do ecossistema Synse.',
  applicationName: 'SynseHub',
  openGraph: {
    title: 'SynseHub — uma nova forma de conectar academia, gestão e saúde',
    description:
      'Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema.',
    type: 'website',
    locale: 'pt_BR',
  },
  robots: { index: APP.env === 'production', follow: APP.env === 'production' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5FAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#041D1B' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          A fonte é carregada em runtime (e não no build) para que o projeto
          compile em ambientes sem acesso à rede. Sem ela, a pilha de sistema
          assume sem quebrar o layout.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Regra do Pages Router; no App Router a folha vale para todas as rotas. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
        />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `:root{--font-sans:'Manrope','Inter',system-ui,-apple-system,'Segoe UI',sans-serif}`,
          }}
        />
        <ThemeScript />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
