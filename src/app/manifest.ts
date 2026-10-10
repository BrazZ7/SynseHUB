import type { MetadataRoute } from 'next'

import { APP } from '@/config/app'

/**
 * Manifesto do Synse App.
 *
 * É o que transforma o endereço em aplicativo na tela inicial: ícone próprio,
 * sem barra de navegador, abrindo direto no app do aluno. Sem ele, o SynseRun
 * é um site que se parece com um app — e a diferença aparece no primeiro
 * `start_url`, que abriria a página de vendas em vez da tela de hoje.
 *
 * `display: standalone` some com a barra de endereço, e é justamente por isso
 * que toda tela precisa do próprio botão de voltar: instalado, não existe seta
 * do navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Synse — treino, corrida e saúde',
    short_name: 'Synse',
    description:
      'Treino, alimentação, desafios e corrida com GPS. O app de quem treina, dentro do ecossistema Synse.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#041D1B',
    theme_color: '#041D1B',
    lang: 'pt-BR',
    categories: ['health', 'fitness', 'sports'],
    icons: [
      {
        src: '/brand/synse-symbol.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Iniciar corrida',
        short_name: 'Correr',
        description: 'Começa uma corrida com GPS no SynseRun',
        url: '/app/run/start?esporte=RUN',
      },
      {
        name: 'Meu treino de hoje',
        short_name: 'Treino',
        url: '/app/workout',
      },
    ],
    ...(APP.env === 'production' ? {} : { name: 'Synse (desenvolvimento)' }),
  }
}
