'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'

import { PERIODOS } from '@/features/synse-body/state'
import { janelaBloqueada } from '@/lib/plans/history'
import type { UserTier } from '@/lib/plans/tiers'
import { cn } from '@/lib/utils'
import type { BodyPeriod } from '@/types/domain'

/**
 * As janelas do histórico.
 *
 * Links e não botões: o período vive na URL, então voltar no navegador
 * funciona, o link é compartilhável, e a página continua sendo renderizada no
 * servidor — sem nenhum estado de cliente para sincronizar.
 */
/**
 * ── A janela que o plano não cobre aparece, trancada ────────────────────────
 *
 * Esconder a opção daria a impressão de que ela não existe — é o mesmo
 * raciocínio do seletor de desafios, onde os do Pro ficam visíveis e
 * bloqueados. Aqui o cadeado leva para a tela do Synse+, e o clique vira um
 * convite em vez de um beco.
 *
 * Isto esconde; quem **recusa** é a leitura no servidor. Forjar o período na
 * barra de endereços passa por cima deste componente e não passa por lá.
 */
export function PeriodSelector({
  atual,
  tier,
  base = '/app/corpo',
}: {
  atual: BodyPeriod
  tier: UserTier
  base?: string
}) {
  return (
    <nav
      aria-label="Período do histórico"
      className="flex gap-1 overflow-x-auto rounded-lg border border-synse-border bg-synse-surface p-1"
    >
      {PERIODOS.map((periodo) => {
        const trancada = janelaBloqueada(tier, periodo.dias)

        return (
          <Link
            key={periodo.valor}
            href={trancada ? '/app/synse' : `${base}?periodo=${periodo.valor}`}
            aria-current={periodo.valor === atual ? 'page' : undefined}
            aria-label={trancada ? `${periodo.rotulo} — disponível no Synse+` : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              periodo.valor === atual && !trancada
                ? 'bg-synse-primary text-white'
                : trancada
                  ? 'text-synse-muted/70 hover:text-synse-primary'
                  : 'text-synse-muted hover:bg-synse-bg hover:text-synse-text',
            )}
          >
            {trancada && <Lock className="size-3 shrink-0" aria-hidden />}
            {periodo.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
