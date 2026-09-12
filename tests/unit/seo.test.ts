import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O painel inteiro é autenticado. Se um dia alguém trocar a configuração e o
 * robots passar a liberar `/students` ou `/finance`, o buscador começa a
 * rastrear dezenas de endereços que só devolvem a tela de login — e nomes de
 * rotas internas viram resultado de busca. Estes testes prendem isso.
 */

async function carregar(env: string, url = 'https://synse.com.br') {
  vi.resetModules()
  vi.doMock('@/config/app', () => ({ APP: { env, url, name: 'SynseHub', version: '0.1.0' } }))

  const robots = (await import('@/app/robots')).default
  const sitemap = (await import('@/app/sitemap')).default
  return { robots: robots(), sitemap: sitemap() }
}

afterEach(() => {
  vi.doUnmock('@/config/app')
  vi.resetModules()
})

describe('robots', () => {
  it('bloqueia as rotas autenticadas em produção', async () => {
    const { robots } = await carregar('production')
    const regra = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules
    const bloqueadas = [regra?.disallow].flat()

    for (const rota of ['/dashboard', '/students', '/finance', '/synse-admin', '/api/']) {
      expect(bloqueadas).toContain(rota)
    }
  })

  it('libera a página inicial e aponta o sitemap para o domínio configurado', async () => {
    const { robots } = await carregar('production')
    const regra = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules

    expect(regra?.allow).toBe('/')
    expect(robots.sitemap).toBe('https://synse.com.br/sitemap.xml')
  })

  it('bloqueia tudo fora de produção, para preview não competir com o site real', async () => {
    const { robots } = await carregar('staging')
    const regra = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules

    expect(regra?.disallow).toBe('/')
    expect(regra?.allow).toBeUndefined()
  })
})

describe('sitemap', () => {
  it('lista só páginas abertas, com o domínio configurado', async () => {
    const { sitemap } = await carregar('production')
    const urls = sitemap.map((entrada) => entrada.url)

    expect(urls).toEqual([
      'https://synse.com.br',
      'https://synse.com.br/signup',
      'https://synse.com.br/login',
      'https://synse.com.br/termos',
      'https://synse.com.br/privacidade',
    ])
  })

  it('acompanha a troca de domínio sem edição de código', async () => {
    const { sitemap } = await carregar('production', 'https://outro.exemplo')

    expect(sitemap[0].url).toBe('https://outro.exemplo')
  })
})
