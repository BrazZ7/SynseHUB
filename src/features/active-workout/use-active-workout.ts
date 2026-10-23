'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  criarSessao,
  duracaoEfetiva,
  exercicioAtual,
  progresso,
  reduzir,
  reidratar,
  restanteDoDescanso,
} from '@/features/active-workout/engine/workout-engine'
import type {
  PlannedExercise,
  WorkoutEvent,
  WorkoutSession,
  WorkoutSettings,
} from '@/features/active-workout/engine/types'
import { criarFeedback, criarLiveActivity } from '@/features/active-workout/platform'
import type { LiveWorkoutState } from '@/features/active-workout/platform/types'
import {
  enfileirar,
  lerFila,
  limparSessao,
  lerSessao,
  salvarSessao,
} from '@/features/active-workout/storage/local-workout'
import {
  registrarRegistroPerdidoAction,
  registrarTreinoRecuperadoAction,
} from '@/features/active-workout/actions'
import { faltaEncerrarNoServidor } from '@/features/active-workout/encerramento'
import { criarComando } from '@/features/active-workout/storage/comando'
import {
  resumoDoTreino,
  type RelatoDoTreino,
  type ResumoDoTreino,
} from '@/features/active-workout/state'
import { sincronizar } from '@/features/active-workout/sync'

/**
 * A ligação entre o engine e a tela.
 *
 * O engine não sabe que React existe; este hook é quem traduz. Ele cuida de
 * quatro coisas que o engine deliberadamente não faz: gravar no aparelho,
 * empurrar a fila, falar com a tela bloqueada, e acordar quando o descanso
 * vence.
 *
 * O cronômetro **não** vive aqui. Ele está em `useRestCountdown`, abaixo, e é
 * usado só pelo componente que mostra o número — senão a tela inteira
 * redesenharia uma vez por segundo durante todo o descanso.
 */

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * As preferências do servidor, para o hook.
 *
 * Chegam por argumento em vez de serem lidas aqui porque quem as tem é a
 * página, que já as carregou do banco no mesmo `Promise.all` do plano — e
 * buscá-las de novo no cliente seria uma ida à rede para saber o que o HTML
 * já trouxe.
 *
 * O `dono` vem pelo mesmo caminho e é a matrícula do aluno (`studentId`), que
 * a página tem da sessão autenticada. Ele separa o que é gravado no aparelho:
 * sem ele, o treino de quem entrou antes reaparecia para quem entrou depois, e
 * a fila pendente subia em nome de quem estivesse logado na hora. Não é lido no
 * cliente de propósito — identidade que o navegador escolhe não é identidade.
 */
export function useActiveWorkout(dono: string, preferencias?: Partial<WorkoutSettings>) {
  const [sessao, setSessao] = useState<WorkoutSession | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pendentes, setPendentes] = useState(0)
  /*
   * O que a fila desistiu de enviar. Antes de existir, a operação esgotada
   * ficava rodando e o contador nunca chegava a zero: a tela dizia
   * "3 a sincronizar" para sempre, sem explicar e sem resolver.
   */
  const [resumoDaFila, setResumoDaFila] = useState<ResumoDoTreino>(null)

  const liveActivity = useMemo(() => criarLiveActivity(), [])
  const feedback = useMemo(() => criarFeedback(), [])
  const serverIdRef = useRef<string | null>(null)
  /*
   * Trava do toque duplo na camada da interface. O engine já ignora o
   * `clientId` repetido e o banco tem unicidade, mas sem isto dois toques
   * rápidos gerariam dois `clientId` diferentes para a mesma série — e aí as
   * duas defesas de baixo não teriam como saber que é a mesma coisa.
   */
  const concluindoRef = useRef(false)
  /*
   * Num ref, e não nas dependências: a recuperação roda uma vez, na montagem,
   * e pô-las na lista faria a sessão guardada ser relida a cada ajuste.
   */
  const preferenciasRef = useRef(preferencias)
  preferenciasRef.current = preferencias
  /*
   * De quem é o treino que está na memória agora.
   *
   * Existe por causa da ordem em que o React roda os efeitos. Se a matrícula
   * mudar com o hook montado, a recuperação (declarada primeiro) zera a tela,
   * mas a persistência (declarada depois) roda no mesmo commit ainda segurando
   * a sessão antiga — e gravaria o treino da pessoa anterior na chave da nova.
   * Este ref só avança quando a sessão nova está de fato em mão, então a
   * gravação fica trancada durante a janela.
   *
   * Hoje a troca de contexto recarrega a página e a janela não acontece. É
   * justamente por isso que a trava está escrita: ninguém notaria a volta do
   * vazamento num refatorador que mantivesse o componente montado.
   */
  const donoNaMemoriaRef = useRef(dono)
  /*
   * Se o encerramento deste treino já foi decidido.
   *
   * Guarda contra enviar dois: `finish_workout_session` grava o status que
   * recebe, e um `COMPLETED` em cima de um `ABANDONED` já enviado viraria
   * treino abandonado em treino concluído. O caminho é real — "Encerrar
   * treino" mostra o resumo, e o "Fechar" do resumo viria depois.
   */
  const encerradoRef = useRef(false)
  /*
   * Esta aba, para o aviso entre abas. Gerado uma vez por montagem: é
   * identidade de janela, não de pessoa.
   */
  const abaRef = useRef(id())
  /**
   * Outra aba assumiu o treino.
   *
   * Enquanto isto é verdade, esta aba não grava e não sincroniza: as duas
   * escrevendo o mesmo registro fazem a última apagar o que a outra gravou, e a
   * pessoa vê o treino andar para trás sem ter desfeito nada. A política inteira
   * está em `storage/comando.ts`.
   */
  const [comandoEmOutraAba, setComandoEmOutraAba] = useState(false)
  const comandoRef = useRef(false)
  comandoRef.current = comandoEmOutraAba

  // ── Recuperação ────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    /*
     * Zera antes de ler. Sem isto, trocar de matrícula e não encontrar treino
     * guardado deixaria na tela o treino da pessoa anterior: o `setSessao` só
     * acontece quando **há** o que restaurar.
     */
    setSessao(null)
    setCarregando(true)
    serverIdRef.current = null

    void (async () => {
      const guardada = await lerSessao(dono)
      if (!vivo) return

      /*
       * Treino concluído não volta para a tela — reabrir o resumo de um treino
       * terminado seria pior. Mas antes de esquecê-lo, o servidor precisa
       * saber que ele acabou: quem fechou o app na tela do resumo, sem tocar
       * em "Fechar", deixou a sessão aberta no servidor. Oito horas depois a
       * regra da 0047 a marca como abandonada, e o histórico — que filtra
       * `COMPLETED` — nunca mostra aquele treino.
       */
      if (guardada && guardada.state === 'WORKOUT_COMPLETED') {
        if (faltaEncerrarNoServidor(guardada, await lerFila(dono), false)) {
          await enfileirar({
            kind: 'FINISH',
            clientId: id(),
            dono,
            sessionClientId: guardada.clientId,
            durationSeconds: duracaoEfetiva(guardada, guardada.finishedAt ?? Date.now()),
            status: 'COMPLETED',
            tentativas: 0,
          })
        }
        /*
         * E conta que foi recuperado: para o servidor, um treino que sobe agora
         * é igual a um que subiu na hora. Quem sabe que o app foi fechado no
         * meio é esta tela.
         */
        void registrarTreinoRecuperadoAction(guardada.clientId)
        await limparSessao(dono)
      }

      if (guardada && guardada.state !== 'WORKOUT_COMPLETED') {
        serverIdRef.current = guardada.serverId
        /*
         * Reidratar antes de mostrar: o descanso pode ter vencido enquanto o
         * app estava fechado, e reiniciar o cronômetro seria mentir.
         *
         * As preferências vêm por cima das que o aparelho guardou. A sessão
         * local pode ter começado há dois dias, antes de a pessoa desligar a
         * vibração no celular novo — e o treino retomado respeitar o ajuste
         * antigo é o defeito que faz alguém jurar que o interruptor não
         * funciona.
         */
        const comPreferencias = {
          ...guardada,
          settings: { ...guardada.settings, ...preferenciasRef.current },
        }
        donoNaMemoriaRef.current = dono
        setSessao(reidratar(comPreferencias, Date.now()))
      }
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
    /*
     * `dono` na lista: a matrícula é o escopo do que foi gravado no aparelho, e
     * ler o escopo errado é o defeito que esta separação existe para fechar.
     */
  }, [dono])

  // ── Persistência ───────────────────────────────────────────────────────────
  useEffect(() => {
    // A trava do `donoNaMemoriaRef` está explicada na declaração dele.
    if (comandoEmOutraAba) return
    if (sessao && donoNaMemoriaRef.current === dono) void salvarSessao(dono, sessao)
  }, [comandoEmOutraAba, dono, sessao])

  // ── Comando entre abas ─────────────────────────────────────────────────────
  const comando = useMemo(() => criarComando(dono, abaRef.current), [dono])

  useEffect(() => {
    comando.ouvir(() => setComandoEmOutraAba(true))
    /*
     * Anuncia na montagem: quem abre a tela assume. É a regra mais simples de
     * explicar — manda quem está olhando — e a única que não precisa de tempo
     * limite para resolver aba fechada.
     */
    comando.anunciar()
    setComandoEmOutraAba(false)
    return () => comando.fechar()
  }, [comando])

  /**
   * Retoma o comando nesta aba.
   *
   * Relê o treino gravado antes de assumir: a outra aba pode ter registrado
   * séries depois de esta ter lido, e assumir com a cópia velha na memória
   * regravaria o registro para trás — exatamente o que a política existe para
   * impedir.
   */
  const assumirComando = useCallback(async () => {
    const guardada = await lerSessao(dono)
    if (guardada && guardada.state !== 'WORKOUT_COMPLETED') {
      serverIdRef.current = guardada.serverId
      donoNaMemoriaRef.current = dono
      setSessao(
        reidratar(
          { ...guardada, settings: { ...guardada.settings, ...preferenciasRef.current } },
          Date.now(),
        ),
      )
    }
    comando.anunciar()
    setComandoEmOutraAba(false)
  }, [comando, dono])

  // ── Tela bloqueada ─────────────────────────────────────────────────────────
  const paraLiveActivity = useCallback((s: WorkoutSession): LiveWorkoutState | null => {
    const exercicio = exercicioAtual(s)
    if (!exercicio) return null
    return {
      exerciseName: exercicio.name,
      setNumber: s.setNumber,
      totalSets: exercicio.sets,
      reps: s.currentReps,
      weight: s.currentWeight,
      phase: s.state === 'RESTING' ? 'REST' : s.state === 'REST_FINISHED' ? 'REST_FINISHED' : 'SET',
      restEndsAt: s.restEndsAt,
      progress: progresso(s),
    }
  }, [])

  useEffect(() => {
    if (!sessao) return
    const estado = paraLiveActivity(sessao)
    if (!estado) return

    if (sessao.state === 'WORKOUT_COMPLETED') {
      void liveActivity.stop()
      void feedback.keepAwake(false)
      return
    }
    void liveActivity.update(estado)
  }, [sessao, liveActivity, feedback, paraLiveActivity])

  // ── O despertador do descanso ──────────────────────────────────────────────
  useEffect(() => {
    if (!sessao || sessao.state !== 'RESTING' || !sessao.restEndsAt) return

    /*
     * Um único `setTimeout` mirando o instante do fim, e não um intervalo de um
     * segundo. Em segundo plano o navegador atrasa o disparo, então a volta do
     * app recalcula pelo `restEndsAt` de qualquer jeito — este temporizador é
     * para quem está com a tela aberta.
     */
    const faltam = sessao.restEndsAt - Date.now()
    const timer = setTimeout(() => {
      const agora = Date.now()
      setSessao((atual) => (atual ? reduzir(atual, { type: 'REST_ELAPSED', agora }) : atual))

      if (sessao.settings.vibration) feedback.vibrate([200, 100, 200])
      if (sessao.settings.sound) feedback.beep()
      const estado = paraLiveActivity(sessao)
      if (estado) void liveActivity.restFinished({ ...estado, phase: 'REST_FINISHED' })
    }, Math.max(faltam, 0))

    return () => clearTimeout(timer)
  }, [sessao, feedback, liveActivity, paraLiveActivity])

  // ── Sincronização ──────────────────────────────────────────────────────────
  const empurrarFila = useCallback(async () => {
    /*
     * Aba sem comando não sincroniza. A fila é a mesma — está no IndexedDB
     * compartilhado — e quem manda drena. Duas abas drenando gastariam rede
     * mandando o mesmo `client_id` duas vezes.
     */
    if (comandoRef.current) return
    const resultado = await sincronizar(dono, serverIdRef.current)
    if (resultado.sessionId && resultado.sessionId !== serverIdRef.current) {
      serverIdRef.current = resultado.sessionId
      setSessao((atual) => (atual ? { ...atual, serverId: resultado.sessionId } : atual))
    }
    setPendentes(resultado.pendentes)

    /*
     * A perda é contada aqui, uma vez, no momento em que o expurgo a reporta —
     * e não a cada passagem da fila, que roda a cada volta de rede e a cada
     * volta do segundo plano. O `expurgar` só devolve número maior que zero na
     * passagem em que removeu as operações, então um identificador novo por
     * chamada não duplica.
     */
    if (resultado.treinosPerdidos > 0) {
      void registrarRegistroPerdidoAction(id(), 'TREINO', resultado.treinosPerdidos)
    }
    if (resultado.seriesPerdidas > 0) {
      void registrarRegistroPerdidoAction(id(), 'SERIE', resultado.seriesPerdidas)
    }

    setResumoDaFila(
      resumoDoTreino({
        pendentes: resultado.pendentes,
        treinosPerdidos: resultado.treinosPerdidos,
        seriesPerdidas: resultado.seriesPerdidas,
        desfazerPerdidos: resultado.desfazerPerdidos,
        relatosPerdidos: resultado.relatosPerdidos,
      }),
    )
  }, [dono])

  useEffect(() => {
    if (!sessao) return
    void empurrarFila()

    // A volta da rede é o momento óbvio de tentar de novo.
    const aoConectar = () => void empurrarFila()
    /*
     * E a volta do segundo plano também: no aplicativo, o evento `online` pode
     * ter acontecido com o processo suspenso, sem ninguém para ouvir. Sem isto,
     * o treino ficava pendente até a pessoa tocar em alguma coisa.
     */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void empurrarFila()
    }

    window.addEventListener('online', aoConectar)
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      window.removeEventListener('online', aoConectar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [sessao?.completedSets.length, sessao?.state, empurrarFila, sessao])

  // ── Ações ──────────────────────────────────────────────────────────────────
  const despachar = useCallback((evento: WorkoutEvent) => {
    setSessao((atual) => (atual ? reduzir(atual, evento) : atual))
  }, [])

  const iniciar = useCallback(
    async (input: {
      workoutPlanId: string | null
      planName: string
      exercises: PlannedExercise[]
      settings?: Partial<WorkoutSettings>
    }) => {
      const agora = Date.now()
      const clientId = id()
      const nova = reduzir(
        criarSessao({ clientId, ...input, agora }),
        { type: 'START', agora },
      )
      donoNaMemoriaRef.current = dono
      setSessao(nova)

      await enfileirar({
        kind: 'START',
        clientId,
        dono,
        workoutPlanId: input.workoutPlanId,
        tentativas: 0,
      })

      /*
       * A permissão é pedida aqui, no primeiro treino — não na abertura do app.
       * Quem acabou de instalar não tem contexto para decidir; quem apertou
       * "começar treino" tem.
       */
      if (await liveActivity.isSupported()) await liveActivity.requestPermission()
      if (nova.settings.keepScreenAwake) await feedback.keepAwake(true)
      // Mesma razão da permissão: é o gesto que abre o canal de som.
      if (nova.settings.sound) await feedback.prepararSom()

      const estado = paraLiveActivity(nova)
      if (estado) await liveActivity.start(estado)
      void empurrarFila()
    },
    [dono, liveActivity, feedback, paraLiveActivity, empurrarFila],
  )

  const concluirSerie = useCallback(async () => {
    if (!sessao || concluindoRef.current) return
    concluindoRef.current = true

    try {
      const agora = Date.now()
      const clientId = id()
      const exercicio = exercicioAtual(sessao)
      if (!exercicio) return

      const depois = reduzir(sessao, { type: 'COMPLETE_SET', agora, clientId })
      // O engine devolve a mesma sessão quando ignora o evento; não enfileira.
      if (depois === sessao) return
      setSessao(depois)

      await enfileirar({
        kind: 'SET',
        clientId,
        dono,
        sessionClientId: sessao.clientId,
        exerciseId: exercicio.exerciseId,
        setNumber: sessao.setNumber,
        repsPlanned: Number.isFinite(Number(exercicio.reps)) ? Number(exercicio.reps) : null,
        repsCompleted: sessao.currentReps,
        weight: sessao.currentWeight,
        restSeconds: exercicio.restSeconds,
        startedAt: sessao.setStartedAt,
        completedAt: agora,
        tentativas: 0,
      })

      if (sessao.settings.vibration) feedback.vibrate([40])
      void empurrarFila()
    } finally {
      // Curto o bastante para não atrapalhar quem treina rápido, longo o
      // bastante para absorver o toque duplo.
      setTimeout(() => {
        concluindoRef.current = false
      }, 400)
    }
  }, [dono, sessao, feedback, empurrarFila])

  /**
   * Desfaz a última série concluída.
   *
   * A série sai do estado local **e** sobe um desfazer para o servidor. Ela
   * quase sempre já chegou lá: a fila sincroniza em segundos e o desfazer
   * acontece durante o descanso.
   *
   * O desfazer é enfileirado mesmo quando o registro da série ainda está na
   * fila, em vez de tirá-lo de lá. Parece desperdício — mandar a série e
   * desfazê-la em seguida — e é a escolha certa: entre ler a fila e remover o
   * registro, a sincronização pode estar enviando aquela série naquele
   * instante. Removê-la deixaria o servidor com uma série que a tela diz que
   * não existe, e ninguém descobriria até o histórico não bater. Com as duas
   * operações na fila, a ordem (`ordem.ts`) garante que o desfazer chega
   * atrás da série, e `desfazer_serie` (0058) é inofensiva quando não há o que
   * desfazer.
   */
  const desfazer = useCallback(async () => {
    if (!sessao) return
    const ultima = sessao.completedSets[sessao.completedSets.length - 1]
    if (!ultima) return

    const agora = Date.now()
    const depois = reduzir(sessao, { type: 'UNDO_SET', agora })
    // O engine devolve a mesma sessão quando recusa o evento — em pausa, por
    // exemplo. Aí não há o que desfazer no servidor também.
    if (depois === sessao) return
    setSessao(depois)

    await enfileirar({
      kind: 'UNDO',
      clientId: id(),
      dono,
      sessionClientId: sessao.clientId,
      serieClientId: ultima.clientId,
      tentativas: 0,
    })

    if (sessao.settings.vibration) feedback.vibrate([20, 60, 20])
    void empurrarFila()
  }, [dono, sessao, feedback, empurrarFila])

  const encerrar = useCallback(
    async (status: 'COMPLETED' | 'ABANDONED' = 'COMPLETED') => {
      if (!sessao) return
      const agora = Date.now()
      const final = reduzir(sessao, { type: 'FINISH', agora })
      setSessao(final)

      if (faltaEncerrarNoServidor(sessao, await lerFila(dono), encerradoRef.current)) {
        await enfileirar({
          kind: 'FINISH',
          clientId: id(),
          dono,
          sessionClientId: sessao.clientId,
          durationSeconds: duracaoEfetiva(final, agora),
          status,
          tentativas: 0,
        })
        encerradoRef.current = true
      }

      await liveActivity.stop()
      await feedback.keepAwake(false)
      void empurrarFila()
    },
    [dono, sessao, liveActivity, feedback, empurrarFila],
  )

  /**
   * Fecha o treino: avisa o servidor e limpa o aparelho.
   *
   * É o que o "Fechar" do resumo e o "Descartar" da retomada chamam. Antes
   * disto, os dois só limpavam o aparelho — e aí a sessão ficava aberta no
   * servidor. Para o treino concluído isso significava histórico vazio; para o
   * descartado, significava que as séries do treino seguinte caíam na sessão
   * velha, porque `start_workout_session` devolve a que já está aberta.
   */
  const fechar = useCallback(
    async (status: 'COMPLETED' | 'ABANDONED', relato?: RelatoDoTreino) => {
      /*
       * O relato entra na fila **antes** de `limparSessao`: depois dela não há
       * mais `sessao.clientId`, e sem ele a operação não sabe a que treino se
       * refere. A ordem de envio quem resolve é `ordem.ts`, que o põe por
       * último — então enfileirar aqui, antes do encerramento, é inofensivo.
       */
      if (sessao && relato) {
        await enfileirar({
          kind: 'FEEDBACK',
          clientId: id(),
          dono,
          sessionClientId: sessao.clientId,
          effort: relato.effort,
          discomfort: relato.discomfort,
          note: relato.note,
          tentativas: 0,
        })
      }

      if (sessao && faltaEncerrarNoServidor(sessao, await lerFila(dono), encerradoRef.current)) {
        const agora = Date.now()
        const final = reduzir(sessao, { type: 'FINISH', agora })
        await enfileirar({
          kind: 'FINISH',
          clientId: id(),
          dono,
          sessionClientId: sessao.clientId,
          durationSeconds: duracaoEfetiva(final, agora),
          status,
          tentativas: 0,
        })
        encerradoRef.current = true
      }

      await limparSessao(dono)
      await liveActivity.stop()
      await feedback.keepAwake(false)
      setSessao(null)
      encerradoRef.current = false
      void empurrarFila()
    },
    [dono, sessao, liveActivity, feedback, empurrarFila],
  )

  /**
   * O "Fechar" do resumo: o treino terminou, e o servidor precisa saber.
   *
   * `relato` é opcional porque a escala de esforço é opcional. Quem só quer
   * sair da tela sai, e isso é de propósito: o resumo aparece no instante em
   * que a pessoa quer guardar o celular.
   */
  const concluirTreino = useCallback(
    (relato?: RelatoDoTreino) => fechar('COMPLETED', relato),
    [fechar],
  )

  /**
   * O "Descartar e começar outro" da retomada.
   *
   * Encerra como abandonado em vez de só apagar do aparelho. Sem isso, a
   * sessão continuava aberta no servidor e `start_workout_session` a devolvia
   * para o treino seguinte: as séries de hoje entravam no treino de ontem.
   */
  const descartar = useCallback(() => fechar('ABANDONED'), [fechar])

  /**
   * Exposto para o interruptor "Som": ligá-lo é o outro gesto que pode abrir o
   * canal de áudio. Sem isto, quem liga o som no meio do treino — depois de o
   * `iniciar` ter passado com ele desligado — não ouviria nada até o treino
   * seguinte, e não teria como saber por quê.
   */
  const prepararSom = useCallback(() => feedback.prepararSom(), [feedback])

  return {
    sessao,
    carregando,
    pendentes,
    resumoDaFila,
    iniciar,
    prepararSom,
    comandoEmOutraAba,
    assumirComando,
    concluirSerie,
    concluirTreino,
    desfazer,
    /**
     * Se há o que desfazer.
     *
     * A tela precisa da resposta para não oferecer um botão que não faz nada.
     * Em pausa não oferece: o desfazer põe o treino em ACTIVE_SET e retomaria
     * o treino de lado, sem fechar a conta do tempo parado.
     */
    podeDesfazer: !!sessao && sessao.completedSets.length > 0 && sessao.state !== 'PAUSED',
    encerrar,
    descartar,
    despachar,
    exercicio: sessao ? exercicioAtual(sessao) : undefined,
    progresso: sessao ? progresso(sessao) : 0,
  }
}

/**
 * O cronômetro, isolado.
 *
 * Vive sozinho porque é o único pedaço que precisa redesenhar a cada segundo.
 * Usado dentro do componente que mostra o número, mantém o resto da tela — os
 * botões grandes, a lista de séries, o progresso — fora do ciclo.
 *
 * O valor vem sempre de `restEndsAt - agora`. O intervalo só existe para
 * provocar o redesenho; ele não guarda contagem nenhuma, então atrasar ou
 * perder um tique não acumula erro.
 */
export function useRestCountdown(restEndsAt: number | null): number {
  const [restante, setRestante] = useState(() =>
    restEndsAt ? Math.max(Math.ceil((restEndsAt - Date.now()) / 1000), 0) : 0,
  )

  useEffect(() => {
    if (!restEndsAt) {
      setRestante(0)
      return
    }

    const calcular = () => setRestante(Math.max(Math.ceil((restEndsAt - Date.now()) / 1000), 0))
    calcular()
    const intervalo = setInterval(calcular, 250)

    /*
     * A volta do segundo plano recalcula na hora, sem esperar o próximo tique:
     * o número precisa estar certo no instante em que a tela reaparece.
     */
    const aoVoltar = () => document.visibilityState === 'visible' && calcular()
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [restEndsAt])

  return restante
}

export { restanteDoDescanso }
