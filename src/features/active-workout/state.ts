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

  if (estado.pendentes === 0) return null

  const plural = estado.pendentes > 1
  return {
    tom: 'neutro',
    texto: plural
      ? `${estado.pendentes} registros do treino aguardando conexão. Sobem sozinhos.`
      : 'Um registro do treino aguardando conexão. Sobe sozinho.',
  }
}
