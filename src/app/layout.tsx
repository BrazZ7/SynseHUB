import type { Metadata, Viewport } from 'next'

import { APP } from '@/config/app'
import { ThemeScript } from '@/components/synse/theme-script'
import { NativeShell } from '@/features/native/native-shell'
import { OfflineBanner } from '@/features/native/offline-banner'

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
    description: 'Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema.',
    type: 'website',
    locale: 'pt_BR',
  },
  robots: { index: APP.env === 'production', follow: APP.env === 'production' },
  manifest: '/manifest.webmanifest',
  /*
   * O iOS ignora o manifesto para instalar na tela inicial e lê estas duas
   * meta-tags. Sem elas, o app instalado no iPhone abre com barra de
   * navegador e a barra inferior do Synse briga com a do Safari.
   */
  appleWebApp: {
    capable: true,
    title: 'Synse',
    statusBarStyle: 'black-translucent',
  },
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
          A Manrope é servida deste domínio, de `public/fonts`, declarada em
          `globals.css`. O `preload` só do subconjunto latino: é o que toda
          tela em português usa, e é o que precisa estar pronto antes da
          primeira pintura. O `latin-ext` fica para quando um caractere pedir.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/manrope-latin.woff2"
          crossOrigin="anonymous"
        />
        <style
          // HTML literal e fixo, sem entrada de usuário: não há superfície de injeção.
          dangerouslySetInnerHTML={{
            __html: `:root{--font-sans:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif}`,
          }}
        />
        <ThemeScript />
      </head>
      <body className="font-sans">
        {/*
          No navegador não faz nada. No APK é quem esconde a splash, trata o
          botão voltar do Android e revalida a tela ao voltar do segundo plano.
        */}
        <NativeShell />
        {/*
          A tela de `errorPath` cobre o app que não conseguiu abrir. Esta cobre
          a rede que cai com o app já na mão — que é o caso comum no subsolo de
          uma academia.
        */}
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
