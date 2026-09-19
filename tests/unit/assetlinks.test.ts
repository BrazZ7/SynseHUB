import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O arquivo que faz um link do Synse abrir no app.
 *
 * O caso que este teste existe para prender é o do arquivo vazio. Um
 * `assetlinks.json` bem formado e sem nenhuma digital faz o Android concluir
 * que o domínio **nega** aquele aplicativo — pior que não existir, porque a
 * verificação passa a falhar ativamente e a mensagem não diz isso. Ausente
 * deixa a verificação pendente, que é a verdade enquanto ninguém configurou.
 */

async function carregar(fingerprints?: string, appId?: string) {
  vi.resetModules()
  process.env.ANDROID_CERT_FINGERPRINTS = fingerprints ?? ''
  if (appId) process.env.NEXT_PUBLIC_ANDROID_APP_ID = appId

  const { GET } = await import('@/app/.well-known/assetlinks.json/route')
  return GET()
}

afterEach(() => {
  delete process.env.ANDROID_CERT_FINGERPRINTS
  delete process.env.NEXT_PUBLIC_ANDROID_APP_ID
  vi.resetModules()
})

describe('/.well-known/assetlinks.json', () => {
  it('sem digital configurada, responde 404 em vez de arquivo vazio', async () => {
    const resposta = await carregar('')
    expect(resposta.status).toBe(404)
  })

  it('espaço em branco não conta como digital', async () => {
    expect((await carregar('  ,  ,')).status).toBe(404)
  })

  it('com digital, entrega o formato que o Android espera', async () => {
    const digital = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
    const resposta = await carregar(digital)

    expect(resposta.status).toBe(200)
    const corpo = await resposta.json()

    expect(corpo).toHaveLength(1)
    expect(corpo[0].relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(corpo[0].target.namespace).toBe('android_app')
    expect(corpo[0].target.package_name).toBe('br.com.synse.app')
    expect(corpo[0].target.sha256_cert_fingerprints).toEqual([digital])
  })

  it('aceita as duas digitais que um app publicado costuma ter', async () => {
    // Produção e teste interno assinam com certificados diferentes.
    const resposta = await carregar('aa:bb, cc:dd')
    const corpo = await resposta.json()

    // Maiúsculas: é como a Play Console mostra, e a comparação do Android não
    // diferencia — normalizar evita um arquivo que parece errado a olho nu.
    expect(corpo[0].target.sha256_cert_fingerprints).toEqual(['AA:BB', 'CC:DD'])
  })
})
