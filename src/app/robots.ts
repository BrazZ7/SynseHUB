import type { MetadataRoute } from 'next'

import { APP } from '@/config/app'

/**
 * Rotas que nunca devem entrar em buscador.
 *
 * Todas exigem sessão e redirecionam para /login, então o robô não veria
 * conteúdo — mas veria a tela de login em dezenas de endereços diferentes,
 * gastando rastreio e poluindo o índice com páginas que não servem a ninguém.
 * `/api` fica de fora pelo mesmo motivo, e o webhook de pagamento não tem
 * nada a fazer num resultado de busca.
 */
const PRIVADAS = [
  '/api/',
  '/app/',
  '/auth/',
  '/checkin',
  '/dashboard',
  '/finance',
  '/help',
  '/onboarding',
  '/plans',
  '/settings',
  '/staff',
  '/students',
  '/synse-admin',
  '/synse-pay',
  '/workouts',
]

export default function robots(): MetadataRoute.Robots {
  /*
   * Fora de produção, nada é indexável.
   *
   * Preview e staging servem o mesmo conteúdo em outro endereço; indexados,
   * competem com o site real pela mesma busca.
   */
  if (APP.env !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVADAS }],
    sitemap: `${APP.url}/sitemap.xml`,
  }
}
