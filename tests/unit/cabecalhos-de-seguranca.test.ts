import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * ── Os cabeçalhos de segurança ──────────────────────────────────────────────
 *
 * Medido em produção antes de existirem: o site mandava `X-Frame-Options`,
 * `nosniff`, `Referrer-Policy` e `Permissions-Policy`, e **nenhuma CSP**.
 *
 * Cabeçalho de segurança é a coisa mais fácil de perder num refactor: ninguém
 * olha, nenhuma tela quebra, e a falta só aparece quando alguém ataca. Este
 * teste lê a configuração de verdade — não uma cópia da lista — e cobra cada
 * diretiva pelo que ela impede.
 */

type Cabecalho = { key: string; value: string }

async function cabecalhos(): Promise<Map<string, string>> {
  const regras = await nextConfig.headers!()
  const todas = regras.flatMap((r) => r.headers as Cabecalho[])
  return new Map(todas.map((h) => [h.key.toLowerCase(), h.value]))
}

async function diretivas(): Promise<Map<string, string>> {
  const csp = (await cabecalhos()).get('content-security-policy')
  expect(csp, 'não há CSP configurada').toBeTruthy()

  return new Map(
    csp!.split(';').map((parte) => {
      const [nome, ...resto] = parte.trim().split(/\s+/)
      return [nome, resto.join(' ')]
    }),
  )
}

describe('os cabeçalhos de resposta', () => {
  it('a configuração devolve cabeçalhos — o controle', async () => {
    // Sem isto, um `headers()` que devolvesse lista vazia faria todas as
    // asserções abaixo passarem por omissão.
    const mapa = await cabecalhos()
    expect(mapa.size).toBeGreaterThanOrEqual(6)
  })

  it.each([
    ['x-content-type-options', 'nosniff'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['cross-origin-opener-policy', 'same-origin'],
  ])('%s continua valendo %s', async (nome, valor) => {
    expect((await cabecalhos()).get(nome)).toBe(valor)
  })

  it('a câmera é a única permissão aberta, e só para nós', async () => {
    // A câmera é usada para ler o QR do check-in. Microfone e localização
    // não têm uso nenhum no produto — abrir "por via das dúvidas" é dar
    // superfície de graça.
    const valor = (await cabecalhos()).get('permissions-policy') ?? ''
    expect(valor).toContain('camera=(self)')
    expect(valor).toContain('microphone=()')
    expect(valor).toContain('geolocation=()')
  })
})

describe('a política de conteúdo', () => {
  it('nenhuma página pode ser emoldurada', async () => {
    // Clickjacking. Fecha melhor que o `X-Frame-Options`, que só sabe dizer
    // "mesma origem" — e que continua aí para navegador antigo.
    expect((await diretivas()).get('frame-ancestors')).toBe("'none'")
  })

  it('não dá para injetar <base> e sequestrar toda URL relativa', async () => {
    expect((await diretivas()).get('base-uri')).toBe("'self'")
  })

  it('formulário só posta para nós', async () => {
    // Impede que um formulário injetado mande a senha de alguém para fora.
    expect((await diretivas()).get('form-action')).toBe("'self'")
  })

  it('o navegador só fala com o Supabase e conosco', async () => {
    // A porta de saída que um XSS usaria para exfiltrar dado.
    const connect = (await diretivas()).get('connect-src') ?? ''
    expect(connect).toContain("'self'")
    expect(connect).toContain('https://*.supabase.co')
    expect(connect).not.toContain('*;')
    expect(connect.split(/\s+/)).not.toContain('*')
  })

  it('plugin está fechado', async () => {
    expect((await diretivas()).get('object-src')).toBe("'none'")
  })

  it('script de outro domínio não carrega', async () => {
    /*
     * Aqui mora a concessão, e ela está escrita no `next.config.mjs`:
     * `'unsafe-inline'` é necessário porque o Next injeta script embutido
     * para hidratar. O que **não** pode entrar nesta lista é um domínio
     * externo ou `'unsafe-eval'` — com qualquer um dos dois, a diretiva para
     * de servir para o que serve.
     */
    const script = (await diretivas()).get('script-src') ?? ''
    expect(script).toContain("'self'")
    expect(script).not.toContain('http')
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('e o padrão é fechado', async () => {
    expect((await diretivas()).get('default-src')).toBe("'self'")
  })
})
