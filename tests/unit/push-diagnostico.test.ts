import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * ── O diagnóstico das chaves de push ─────────────────────────────────────────
 *
 * Ele existe porque conferir "as chaves chegaram?" custava uma expedição: a
 * chave pública só aparece na tela de perfil, que exige sessão, então a única
 * resposta possível era alguém entrar no app e procurar um cartão numa gaveta.
 *
 * Duas propriedades, e as duas são o ponto:
 *
 * 1. **Ele não vaza valor nenhum.** Se um dia alguém "melhorar" isto mostrando
 *    a chave privada para facilitar o diagnóstico, o teste cai.
 * 2. **`formamUmPar` é o veredito que vale.** A primeira versão perguntava
 *    isto à biblioteca de envio; `setVapidDetails` aceitou 87 letras "P" sem
 *    reclamar, e foi este arquivo que mostrou. Agora a pública é derivada da
 *    privada e comparada — o que pega o erro mais provável de todos aqui:
 *    gerar o par duas vezes e guardar metades diferentes.
 */

const PUBLICA = 'P'.repeat(87)
const PRIVADA = 'p'.repeat(43)

async function diagnosticar(env: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', env.publica ?? '')
  vi.stubEnv('VAPID_PRIVATE_KEY', env.privada ?? '')
  vi.stubEnv('VAPID_SUBJECT', env.contato ?? '')
  const { diagnosticoDoPush } = await import('@/lib/push/env')
  return diagnosticoDoPush()
}

afterEach(() => vi.unstubAllEnvs())

describe('diagnóstico do push', () => {
  it('sem nada configurado, diz o que falta', async () => {
    const d = await diagnosticar({})

    expect(d.configurado).toBe(false)
    expect(d.chavePublica).toBe('ausente')
    expect(d.chavePrivada).toBe('ausente')
    expect(d.contato).toBe('ausente')
    // Nulo, e não `false`: a biblioteca nem foi consultada.
    expect(d.formamUmPar).toBeNull()
  })

  it('aponta o tamanho errado, que é o erro de cópia', async () => {
    const d = await diagnosticar({ publica: 'curta', privada: PRIVADA, contato: 'mailto:a@b.c' })

    expect(d.chavePublica).toBe('tamanho-inesperado')
    expect(d.chavePrivada).toBe('ok')
  })

  it('aponta o contato sem esquema — o erro que falha só no envio', async () => {
    /*
     * Sem `mailto:` o cartão aparece, a pessoa clica, e o aviso não chega.
     * É o defeito mais caro de achar desta configuração inteira.
     */
    const d = await diagnosticar({ publica: PUBLICA, privada: PRIVADA, contato: 'a@b.c' })

    expect(d.contato).toBe('sem-mailto-ou-https')
  })

  it('com um par de verdade, confirma que são par', async () => {
    const webpush = await import('web-push')
    const chaves = webpush.default.generateVAPIDKeys()

    const d = await diagnosticar({
      publica: chaves.publicKey,
      privada: chaves.privateKey,
      contato: 'mailto:contato@synse.com.br',
    })

    expect(d.configurado).toBe(true)
    expect(d.chavePublica).toBe('ok')
    expect(d.chavePrivada).toBe('ok')
    expect(d.contato).toBe('ok')
    expect(d.formamUmPar).toBe(true)
  })

  it('tamanho certo e conteúdo inválido: não são par', async () => {
    // Tamanho não é validade. É exatamente o buraco que a derivação fecha.
    const d = await diagnosticar({ publica: PUBLICA, privada: PRIVADA, contato: 'mailto:a@b.c' })

    expect(d.chavePublica).toBe('ok')
    expect(d.formamUmPar).toBe(false)
  })

  it('metades de pares diferentes: não são par', async () => {
    /*
     * O erro mais provável desta configuração inteira, e o único invisível:
     * gerar duas vezes e guardar a pública de um com a privada do outro.
     * Tamanho bate, formato bate, cartão aparece — e o envio falha calado.
     */
    const webpush = await import('web-push')
    const primeiro = webpush.default.generateVAPIDKeys()
    const segundo = webpush.default.generateVAPIDKeys()

    const d = await diagnosticar({
      publica: primeiro.publicKey,
      privada: segundo.privateKey,
      contato: 'mailto:contato@synse.com.br',
    })

    expect(d.chavePublica).toBe('ok')
    expect(d.chavePrivada).toBe('ok')
    expect(d.formamUmPar).toBe(false)
  })

  it('não devolve valor nenhum — nem a pública', async () => {
    const webpush = await import('web-push')
    const chaves = webpush.default.generateVAPIDKeys()

    const d = await diagnosticar({
      publica: chaves.publicKey,
      privada: chaves.privateKey,
      contato: 'mailto:contato@synse.com.br',
    })

    const serializado = JSON.stringify(d)
    expect(serializado).not.toContain(chaves.publicKey)
    expect(serializado).not.toContain(chaves.privateKey)
    expect(serializado).not.toContain('synse.com.br')
  })
})
