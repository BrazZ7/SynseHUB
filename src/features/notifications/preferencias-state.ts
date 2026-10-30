import type { NotificationCategory, NotificationPreference } from '@/types/domain'

/**
 * As preferências de aviso, do lado da tela.
 *
 * Fora do arquivo de actions porque ele é `'use server'` e só exporta função
 * assíncrona.
 */

type Rotulo = { rotulo: string; ajuda: string }

/**
 * As categorias que a tela oferece, com o que cada uma significa.
 *
 * **`SYSTEM` não está aqui, e é de propósito.** É a categoria reservada para
 * aviso de conta e segurança; nenhum gatilho a emite hoje, e o banco aceita a
 * preferência para ela. A trava é desta lista: o dia em que `SYSTEM` passar a
 * carregar aviso dispensável, é aqui que ela entra.
 *
 * Por isso é um objeto parcial sobre a união, e não um `Record` completo — ao
 * contrário dos rótulos da entrada guiada, aqui a lista é **deliberadamente**
 * menor que o enum, e um `Record` obrigaria a inventar texto para a categoria
 * que a tela não mostra.
 */
export const CATEGORIAS_NA_TELA: ReadonlyArray<{ valor: NotificationCategory } & Rotulo> = [
  {
    valor: 'WORKOUT',
    rotulo: 'Treino',
    ajuda: 'Quando seu professor atribui um treino novo',
  },
  {
    valor: 'PAYMENT',
    rotulo: 'Cobrança',
    ajuda: 'Mensalidade criada e pagamento confirmado',
  },
  {
    valor: 'GYM',
    rotulo: 'Academia',
    ajuda: 'Matrícula, aulas e avisos da sua academia',
  },
  {
    valor: 'CONTENT',
    rotulo: 'Conteúdo',
    ajuda: 'Plano alimentar e material novo publicado',
  },
  {
    valor: 'PROGRAM',
    rotulo: 'Programas',
    ajuda: 'Seus programas guiados e desafios',
  },
]

/**
 * O estado de cada interruptor.
 *
 * **Ausência é ligado.** A tabela guarda escolha, não estado: quem nunca mexeu
 * não tem linha, e recebe tudo. Partir de "desligado" aqui mostraria a tela
 * inteira apagada para quem está recebendo avisos normalmente.
 */
export function estadoDasCategorias(
  preferencias: readonly NotificationPreference[],
): Array<{ valor: NotificationCategory; rotulo: string; ajuda: string; ligada: boolean }> {
  const desligadas = new Set(preferencias.filter((p) => p.enabled === false).map((p) => p.category))
  return CATEGORIAS_NA_TELA.map((c) => ({ ...c, ligada: !desligadas.has(c.valor) }))
}

/** Quantas a pessoa desligou. Zero não vira aviso na tela. */
export function quantasDesligadas(preferencias: readonly NotificationPreference[]): number {
  return estadoDasCategorias(preferencias).filter((c) => !c.ligada).length
}
