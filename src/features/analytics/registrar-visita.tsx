'use client'

import { useEffect, useRef } from 'react'

import { registrarEventoAction } from '@/features/analytics/actions'
import type { NomeDeEvento, RotuloDeEvento } from '@/features/analytics/eventos'

/**
 * Registra que uma tela foi aberta.
 *
 * ── Por que no cliente, e não na página ─────────────────────────────────────
 *
 * A página é um componente de servidor, e o Next **pré-busca** rotas quando o
 * link entra na tela ou recebe o cursor. Um evento disparado lá contaria visita
 * de quem passou o dedo perto do link — é o caso de "duplicação por
 * renderização" que o pedido manda evitar, e ele inflaria justamente o
 * indicador de resumo consultado.
 *
 * Montagem no cliente é o momento em que a tela existe para alguém.
 *
 * ── Por que o identificador nasce aqui ──────────────────────────────────────
 *
 * Um por montagem. React em modo estrito monta duas vezes em
 * desenvolvimento, e a volta pelo botão de voltar remonta — o `ref` segura a
 * primeira, e o `clientId` estável faria o banco segurar a segunda de qualquer
 * jeito (`unique (name, client_id)`).
 */
export function RegistrarVisita({
  nome,
  rotulo,
}: {
  nome: NomeDeEvento
  rotulo?: RotuloDeEvento
}) {
  const jaRegistrou = useRef(false)

  useEffect(() => {
    if (jaRegistrou.current) return
    jaRegistrou.current = true

    const clientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    void registrarEventoAction(nome, clientId, rotulo)
  }, [nome, rotulo])

  return null
}
