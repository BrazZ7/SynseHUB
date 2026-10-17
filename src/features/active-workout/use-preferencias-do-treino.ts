'use client'

import { useCallback, useRef, useState, useTransition } from 'react'

import { saveWorkoutPreferencesAction } from '@/features/active-workout/actions'
import type { WorkoutPreferences } from '@/types/domain'

/**
 * ── As preferências do treino, do lado da tela ──────────────────────────────
 *
 * `saveWorkoutPreferencesAction` existia desde a 0026 e **nenhuma tela a
 * chamava**. A tabela `workout_preferences` era criada, a RLS protegia, o data
 * source sabia ler e gravar — e o aluno não tinha onde mexer. Quem quisesse
 * treinar sem vibração ou com avanço automático convivia com o padrão.
 *
 * ── Otimista, e desfaz se o servidor recusar ────────────────────────────────
 *
 * Mesmo desenho da privacidade da corrida, e pela mesma razão: interruptor que
 * espera a rede para mudar de posição parece quebrado na academia de subsolo.
 * Ele vira na hora; se a gravação falhar, volta — e aí a tela diz por quê, em
 * vez de ficar marcada numa escolha que não foi guardada.
 *
 * O desfazer repõe **só as chaves que esta mudança tocou**. Reinstalar o
 * objeto inteiro desfaria de quebra um ajuste posterior que já tinha subido,
 * e a pessoa veria um interruptor virar sozinho sem ter encostado nele.
 *
 * ── O `aplicar` ─────────────────────────────────────────────────────────────
 *
 * O treino em andamento guarda a própria cópia das preferências dentro da
 * sessão (é o que o engine lê). Este retorno de chamada é como o painel avisa
 * a sessão viva — e ele é chamado nas duas direções, na mudança e no desfazer,
 * senão o engine ficaria com o valor que o servidor recusou.
 */
export function usePreferenciasDoTreino(
  iniciais: WorkoutPreferences,
  aplicar?: (preferencias: WorkoutPreferences) => void,
) {
  const [preferencias, setPreferencias] = useState(iniciais)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciarTransicao] = useTransition()

  /*
   * O valor corrente num ref, além do estado. Dois toques seguidos acontecem
   * antes de o React redesenhar, e ler o estado de dentro do `useCallback`
   * daria o valor de antes do primeiro — o segundo ajuste apagaria o primeiro.
   */
  const atualRef = useRef(iniciais)
  const aplicarRef = useRef(aplicar)
  aplicarRef.current = aplicar

  const mudar = useCallback((parcial: Partial<WorkoutPreferences>) => {
    const anterior = atualRef.current
    const proximo = { ...anterior, ...parcial }

    atualRef.current = proximo
    setPreferencias(proximo)
    aplicarRef.current?.(proximo)

    iniciarTransicao(async () => {
      const resultado = await saveWorkoutPreferencesAction(proximo)
      if (resultado.ok) {
        setErro(null)
        return
      }

      const desfeito = { ...atualRef.current }
      for (const chave of Object.keys(parcial) as (keyof WorkoutPreferences)[]) {
        Object.assign(desfeito, { [chave]: anterior[chave] })
      }

      atualRef.current = desfeito
      setPreferencias(desfeito)
      aplicarRef.current?.(desfeito)
      setErro(resultado.erro)
    })
  }, [])

  return { preferencias, mudar, erro, gravando }
}
