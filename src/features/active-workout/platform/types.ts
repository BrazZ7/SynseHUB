/**
 * A porta para a tela bloqueada.
 *
 * Existe uma interface no meio porque as três plataformas fazem a mesma coisa
 * por caminhos que não se parecem: no iOS é uma Live Activity do ActivityKit,
 * no Android uma ongoing notification de um foreground service, e na web um
 * aviso com Wake Lock. Se o engine falasse com qualquer uma delas diretamente,
 * a lógica do treino ficaria presa a uma.
 *
 * Toda operação é "melhor esforço": nenhuma falha aqui pode derrubar o treino.
 * Quem está no supino não quer ver erro porque a notificação foi negada.
 */

/** O que a tela bloqueada precisa saber. Nada além disso atravessa a ponte. */
export type LiveWorkoutState = {
  exerciseName: string
  setNumber: number
  totalSets: number
  reps: number
  weight: number | null
  phase: 'SET' | 'REST' | 'REST_FINISHED'
  /**
   * Instante do fim do descanso, em epoch ms. Vai como instante, não como
   * contagem: tanto o ActivityKit quanto a notificação do Android sabem
   * animar um cronômetro sozinhos a partir de uma data-alvo, sem o app
   * precisar acordar a cada segundo para atualizar o texto.
   */
  restEndsAt: number | null
  progress: number
}

export type LiveActivityPort = {
  /** O ambiente suporta acompanhar o treino com a tela bloqueada? */
  readonly kind: 'ios' | 'android' | 'web'
  isSupported(): Promise<boolean>
  /**
   * Pede a permissão no momento certo — ao iniciar o primeiro treino, não na
   * abertura do app. Devolve se ficou concedida.
   */
  requestPermission(): Promise<boolean>
  start(state: LiveWorkoutState): Promise<void>
  update(state: LiveWorkoutState): Promise<void>
  /** Descanso acabou: vibra, alerta, e muda o cartão da tela bloqueada. */
  restFinished(state: LiveWorkoutState): Promise<void>
  stop(): Promise<void>
  /**
   * Ações vindas da tela bloqueada — o botão CONCLUIR SÉRIE da Live Activity,
   * o PULAR da notificação do Android. Devolve a função que cancela a escuta.
   */
  onRemoteAction(handler: (acao: RemoteAction) => void): () => void
}

export type RemoteAction = 'COMPLETE_SET' | 'SKIP_REST' | 'ADD_REST' | 'NEXT_SET'

/** Feedback tátil e sonoro, separado da tela bloqueada porque vale nas duas. */
export type FeedbackPort = {
  vibrate(padrao: number[]): void
  /** Mantém a tela ligada enquanto o treino corre. Devolve como liberar. */
  keepAwake(ativo: boolean): Promise<void>
}
