import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Ambiente } from '@/lib/plans/lojas/apple-jws'

/**
 * A configuração da App Store que mais de um caminho precisa.
 *
 * Estava duplicada entre a rota da compra e a da notificação, e duplicada ela
 * divergiria exatamente no lugar em que divergir é mais caro: uma das duas
 * aceitando sandbox em produção enquanto a outra não.
 */

/**
 * Quais ambientes aceitar.
 *
 * `Sandbox` entra só fora de produção, ou com `APPLE_ACEITA_SANDBOX=1` — que
 * existe para o TestFlight, que roda em sandbox com o app de produção.
 *
 * **Nunca `1` em produção**: conta de teste da Apple é grátis e ilimitada, e
 * aceitar sandbox é dar Synse+ de graça a quem tiver uma, sem aparecer em
 * relatório de receita nenhum.
 */
export function ambientesDaApple(): readonly Ambiente[] {
  const aceitaTeste =
    process.env.APPLE_ACEITA_SANDBOX === '1' || process.env.NEXT_PUBLIC_SYNSE_ENV !== 'production'
  return aceitaTeste ? ['Production', 'Sandbox'] : ['Production']
}

/**
 * A raiz fixada, lida do disco e guardada em memória.
 *
 * `readFileSync` e não `import`: é um `.pem`, e o empacotador do Next não o
 * embute. Se algum dia o arquivo não vier no pacote, a leitura **falha** — e
 * falhar é o certo: sem raiz não há com o que comparar a cadeia, e a
 * alternativa seria verificar contra o certificado que vem dentro da própria
 * JWS, o que é o mesmo que não verificar.
 */
let emCache: string | null = null
export function raizDaApple(): string {
  emCache ??= readFileSync(join(process.cwd(), 'src/lib/plans/lojas/apple-raiz.pem'), 'utf8')
  return emCache
}
