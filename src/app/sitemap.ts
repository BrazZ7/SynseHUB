import type { MetadataRoute } from 'next'

import { APP } from '@/config/app'

/**
 * Só as páginas abertas.
 *
 * O resto do SynseHub é painel autenticado: listar essas rotas aqui seria
 * apontar o buscador para telas que ele nunca vai conseguir ver.
 */
const PUBLICAS = [
  { caminho: '/', priority: 1, changeFrequency: 'monthly' as const },
  { caminho: '/signup', priority: 0.8, changeFrequency: 'yearly' as const },
  { caminho: '/login', priority: 0.3, changeFrequency: 'yearly' as const },
  // Termos e privacidade são exigidos pelas lojas de aplicativo e procurados
  // por quem ainda não tem conta — precisam ser encontráveis.
  { caminho: '/termos', priority: 0.4, changeFrequency: 'yearly' as const },
  { caminho: '/privacidade', priority: 0.4, changeFrequency: 'yearly' as const },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date()

  return PUBLICAS.map(({ caminho, priority, changeFrequency }) => ({
    url: `${APP.url}${caminho === '/' ? '' : caminho}`,
    lastModified: agora,
    changeFrequency,
    priority,
  }))
}
