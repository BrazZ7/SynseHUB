/** Estado das server actions do Treino Ativo. Fora do arquivo `'use server'`. */
export type ActiveWorkoutActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  sessionId?: string
}

export const initialActiveWorkoutState: ActiveWorkoutActionState = { status: 'idle' }

/** O que a faixa de sincronização do treino diz, ou nada quando não há o que dizer. */
export type ResumoDoTreino = { texto: string; tom: 'neutro' | 'alerta' } | null

/**
 * O que o aluno conta sobre o treino que acabou de fazer.
 *
 * Mora aqui, e não no hook, pela mesma regra que trouxe `ResumoDoTreino`: o
 * arquivo de actions é `'use server'` e só exporta função assíncrona, então
 * tipo e constante ficam no `state.ts` irmão.
 */
export type RelatoDoTreino = {
  /** De 1 a 10. */
  effort: number
  discomfort: boolean
  note: string | null
}

/**
 * O recado da fila do Treino Ativo.
 *
 * A regra que importa é a perda. A fila desiste depois de tentar demais, e
 * antes disto a operação esgotada ficava rodando para sempre: o contador nunca
 * chegava a zero e a tela dizia "3 a sincronizar" indefinidamente, sem
 * explicar e sem resolver.
 *
 * Um treino perdido e uma série perdida não são a mesma notícia. Quem treinou
 * uma hora e viu tudo sumir precisa saber que sumiu — e precisa saber antes de
 * abrir o histórico e concluir que o app "não registrou nada".
 */
export function resumoDoTreino(estado: {
  pendentes: number
  treinosPerdidos: number
  seriesPerdidas: number
  /**
   * Desfazeres que a fila desistiu de enviar.
   *
   * Notícia diferente, e por isso não entra na conta das séries perdidas: aqui
   * nada se perdeu — pelo contrário, ficou **a mais**. A série que a pessoa
   * desfez continua no servidor, e ela precisa saber disso para olhar o
   * histórico, em vez de descobrir um número que não reconhece semanas depois.
   */
  desfazerPerdidos?: number
  /**
   * Relatos que a fila desistiu de enviar.
   *
   * Terceira notícia. O treino está no histórico e as séries também — o que
   * não saiu do aparelho foi o recado ao professor. Calar aqui faria a pessoa
   * sair achando que ele foi avisado, que é o pior dos desfechos: ela esperaria
   * um ajuste que ninguém pediu.
   */
  relatosPerdidos?: number
}): ResumoDoTreino {
  if (estado.treinosPerdidos > 0) {
    const plural = estado.treinosPerdidos > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.treinosPerdidos} treinos não puderam ser enviados e não entraram no seu histórico.`
        : 'Um treino não pôde ser enviado e não entrou no seu histórico.',
    }
  }

  if (estado.seriesPerdidas > 0) {
    const plural = estado.seriesPerdidas > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.seriesPerdidas} séries não puderam ser enviadas.`
        : 'Uma série não pôde ser enviada.',
    }
  }

  if ((estado.desfazerPerdidos ?? 0) > 0) {
    /*
     * Depois das perdas de propósito: quem perdeu o treino inteiro não precisa
     * ouvir, no mesmo instante, que uma série desfeita ficou registrada.
     */
    const plural = (estado.desfazerPerdidos ?? 0) > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.desfazerPerdidos} séries que você desfez podem ter ficado no seu histórico. Confira o treino.`
        : 'Uma série que você desfez pode ter ficado no seu histórico. Confira o treino.',
    }
  }

  if ((estado.relatosPerdidos ?? 0) > 0) {
    /*
     * Por último entre as perdas: quem perdeu o treino inteiro não precisa
     * ouvir, no mesmo instante, que o relato também não foi.
     */
    const plural = (estado.relatosPerdidos ?? 0) > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.relatosPerdidos} relatos de treino não chegaram ao seu professor.`
        : 'Seu relato do treino não chegou ao professor.',
    }
  }

  if (estado.pendentes === 0) return null

  const plural = estado.pendentes > 1
  return {
    tom: 'neutro',
    texto: plural
      ? `${estado.pendentes} registros do treino aguardando conexão. Sobem sozinhos.`
      : 'Um registro do treino aguardando conexão. Sobe sozinho.',
  }
}
