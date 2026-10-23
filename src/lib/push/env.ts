import { env } from '@/lib/env'

/**
 * ── As chaves VAPID ──────────────────────────────────────────────────────────
 *
 * O push web exige um par de chaves que identifica o servidor para o serviço
 * de entrega do navegador. A pública vai para o cliente na hora de se
 * inscrever; a privada assina o envio e **nunca sai do servidor**.
 *
 * Gerar é um comando: `npx web-push generate-vapid-keys`. Nenhuma das duas
 * entra no repositório — nem a de desenvolvimento, porque `.env.example` é
 * copiado, e chave de exemplo vira chave de produção de alguém.
 *
 * ── Sem chave, o recurso não existe ─────────────────────────────────────────
 *
 * E a tela diz isso, em vez de oferecer um botão que falha no clique. É a
 * mesma regra da cobrança: simulado em cima de banco real é mentira.
 */

export const VAPID_PUBLIC_KEY = env(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, '')

export function pushConfigurado(): boolean {
  return (
    VAPID_PUBLIC_KEY.length > 0 &&
    env(process.env.VAPID_PRIVATE_KEY, '').length > 0 &&
    env(process.env.VAPID_SUBJECT, '').length > 0
  )
}

/**
 * ── O diagnóstico das chaves, sem mostrar nenhuma ───────────────────────────
 *
 * Existe porque conferir isto custava caro: a chave pública só aparece na tela
 * de perfil, que exige sessão, então a única forma de saber se ela chegou era
 * alguém entrar no app, abrir a gaveta da conta e procurar um cartão. Uma
 * pergunta de sim ou não virava uma expedição.
 *
 * ── O que ele reporta, e por que nada disso é segredo ───────────────────────
 *
 * Presença, tamanho e formato — nunca valor. A pública é pública por desenho;
 * da privada só se diz que existe e se tem o comprimento certo; do contato só
 * se diz se tem esquema (`mailto:` ou `https:`), que é o erro real e frequente.
 *
 * ── `formamUmPar` é o que realmente prova ──────────────────────────────────
 *
 * A primeira versão perguntava isto à biblioteca de envio, achando que
 * `setVapidDetails` validaria as chaves. **Não valida**: ela aceitou 87 letras
 * "P" como chave pública sem reclamar. O teste que eu tinha escrito para
 * confirmar a recusa foi o que mostrou.
 *
 * Então a conferência passou a ser aritmética, e é exata: deriva a chave
 * pública a partir da privada e compara com a que está configurada. Isso pega
 * o erro que nenhuma conferência de tamanho pega e que é o mais provável de
 * todos aqui — **gerar o par duas vezes e guardar a pública de uma com a
 * privada da outra**. Nesse caso tudo parece certo, o cartão aparece, e o
 * envio falha em silêncio.
 */

/** Base64url de 65 bytes (ponto não comprimido P-256). */
const TAMANHO_PUBLICA = 87
/** Base64url de 32 bytes (escalar P-256). */
const TAMANHO_PRIVADA = 43

export type DiagnosticoPush = {
  configurado: boolean
  chavePublica: 'ok' | 'ausente' | 'tamanho-inesperado'
  chavePrivada: 'ok' | 'ausente' | 'tamanho-inesperado'
  contato: 'ok' | 'ausente' | 'sem-mailto-ou-https'
  /** A pública derivada da privada bate com a configurada? */
  formamUmPar: boolean | null
}

function veredito(valor: string, esperado: number): 'ok' | 'ausente' | 'tamanho-inesperado' {
  if (!valor) return 'ausente'
  return valor.length === esperado ? 'ok' : 'tamanho-inesperado'
}

export async function diagnosticoDoPush(): Promise<DiagnosticoPush> {
  const publica = VAPID_PUBLIC_KEY
  const privada = env(process.env.VAPID_PRIVATE_KEY, '')
  const contato = env(process.env.VAPID_SUBJECT, '')

  const base: DiagnosticoPush = {
    configurado: pushConfigurado(),
    chavePublica: veredito(publica, TAMANHO_PUBLICA),
    chavePrivada: veredito(privada, TAMANHO_PRIVADA),
    contato: !contato
      ? 'ausente'
      : /^(mailto:|https:)/.test(contato)
        ? 'ok'
        : 'sem-mailto-ou-https',
    formamUmPar: null,
  }

  // Faltando alguma, não há par a conferir.
  if (!base.configurado) return base

  return { ...base, formamUmPar: await formamUmPar(publica, privada) }
}

/**
 * A pública derivada da privada é a mesma que está configurada?
 *
 * `node:crypto` entra aqui dentro, e não no topo do arquivo, porque este
 * módulo também exporta a constante da chave pública — que é lida por código
 * de página. Import no topo arrastaria um módulo de servidor para onde ele não
 * precisa estar.
 */
async function formamUmPar(publica: string, privada: string): Promise<boolean> {
  try {
    const { createECDH } = await import('node:crypto')
    const bytes = (b64url: string) =>
      Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

    const curva = createECDH('prime256v1')
    curva.setPrivateKey(bytes(privada))
    return curva.getPublicKey().equals(bytes(publica))
  } catch {
    // Chave que nem decodifica cai aqui, e "não formam par" é a resposta certa.
    return false
  }
}
