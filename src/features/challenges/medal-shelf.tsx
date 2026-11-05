import { Trophy } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { MEDAL_LABELS, MedalBadge } from '@/features/challenges/medal-badge'
import { BotaoCompartilhar } from '@/features/share/share-button'
import { BASELINE_CHALLENGES } from '@/lib/baseline/challenges'
import type { ChallengeMedal, MedalLevel } from '@/types/domain'

/**
 * As medalhas conquistadas, no perfil.
 *
 * Elas já eram gravadas pelo banco a cada fim de ciclo e não apareciam em
 * lugar nenhum — o aluno fechava o mês e não via o que tinha ganhado.
 *
 * A ordem é a do tempo, do mais recente para trás: medalha é história, e o que
 * a pessoa quer ver primeiro é a última. Ordenar por nível poria o ouro de um
 * ano atrás na frente do bronze deste mês.
 */

/** Só para o resumo do topo. A ordem é a do pódio, não a do tempo. */
const ORDEM_DO_PODIO: MedalLevel[] = ['OURO', 'PRATA', 'BRONZE', 'PARTICIPACAO']

function tituloDoDesafio(code: string): string {
  return BASELINE_CHALLENGES.find((item) => item.code === code)?.title ?? code
}

function unidadeDoDesafio(code: string): string {
  return BASELINE_CHALLENGES.find((item) => item.code === code)?.unit ?? ''
}

/** "2026-09" vira "setembro de 2026" — o ciclo é como a pessoa conta o tempo. */
function cicloPorExtenso(cycle: string): string {
  const [ano, mes] = cycle.split('-').map(Number)
  if (!ano || !mes) return cycle
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(ano, mes - 1, 1),
  )
}

export function MedalShelf({ medals }: { medals: ChallengeMedal[] }) {
  const porNivel = ORDEM_DO_PODIO.map((nivel) => ({
    nivel,
    total: medals.filter((m) => m.level === nivel).length,
  })).filter((item) => item.total > 0)

  const recentes = [...medals].sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))

  return (
    <section className="vidro-led rounded-2xl border border-synse-border bg-synse-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-synse-text">
        <Trophy className="size-4 text-synse-primary" aria-hidden />
        Suas medalhas
      </h2>

      {medals.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nenhuma medalha ainda"
          description="Escolha um desafio do mês na aba Hoje. No fim do ciclo, o que você fez vira medalha — inclusive se não bater a meta."
        />
      ) : (
        <>
          {/*
            O resumo por nível. Fica acima da lista porque é o que a pessoa
            olha primeiro — quantas de cada — antes de querer saber de qual mês.
          */}
          <ul className="mb-4 flex flex-wrap gap-2">
            {porNivel.map(({ nivel, total }) => (
              <li key={nivel} className="flex items-center gap-2 rounded-lg bg-synse-bg px-3 py-2">
                <MedalBadge level={nivel} size="sm" />
                <span className="text-sm font-semibold tabular-nums text-synse-text">{total}</span>
                <span className="sr-only">
                  {total === 1 ? 'medalha' : 'medalhas'} de {MEDAL_LABELS[nivel]}
                </span>
              </li>
            ))}
          </ul>

          <ul className="divide-y divide-synse-border">
            {recentes.map((medalha) => (
              <li key={medalha.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-synse-text">
                    {tituloDoDesafio(medalha.challengeCode)}
                  </p>
                  <p className="text-xs capitalize text-synse-muted">
                    {cicloPorExtenso(medalha.cycle)}
                  </p>
                </div>
                {/*
                  O número alcançado fica visível junto da medalha: a
                  participação sem o progresso ao lado parece consolo, e com
                  ele vira registro do que a pessoa fez.
                */}
                <span className="shrink-0 text-xs tabular-nums text-synse-muted">
                  {medalha.progressValue} / {medalha.targetValue}
                </span>
                <MedalBadge level={medalha.level} size="sm" />
                <BotaoCompartilhar
                  formato="icone"
                  rotulo={`Compartilhar a medalha de ${tituloDoDesafio(medalha.challengeCode)}`}
                  cartao={{
                    tipo: 'medalha',
                    desafio: tituloDoDesafio(medalha.challengeCode),
                    nivel: MEDAL_LABELS[medalha.level],
                    quando: new Date(medalha.awardedAt),
                    valor: medalha.progressValue,
                    alvo: medalha.targetValue,
                    unidade: unidadeDoDesafio(medalha.challengeCode),
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
