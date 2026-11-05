import { CalendarClock } from 'lucide-react'

import { BarraDeProntidao } from '@/features/squad/barra-de-prontidao'
import { CartaoDoTreino } from '@/features/squad/cartao-do-treino'
import { CodigoDoEsquadrao } from '@/features/squad/codigo-do-esquadrao'
import { MarcarTreino } from '@/features/squad/marcar-treino'
import { Palco } from '@/features/squad/palco'
import { QuemEDoEsquadrao } from '@/features/squad/quem-e-do-esquadrao'
import { Recados } from '@/features/squad/recados'
import { foraDoRanking, prontidao, rankingDaSemana } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { Squad, SquadMember, SquadPing, SquadSession } from '@/types/domain'

/**
 * ── A ordem da tela é a ordem das perguntas ─────────────────────────────────
 *
 * Quem abre o lobby quer saber, nesta ordem: **quem está lá**, **eu já avisei
 * que cheguei?**, **o que está marcado**, **como foi a semana**. O palco vem
 * primeiro porque é a resposta da primeira, e a barra de prontidão logo
 * abaixo porque é a única coisa que a pessoa veio *fazer*.
 *
 * ── Três colunas em tela larga, uma no celular ──────────────────────────────
 *
 * A referência é de desktop e tem treino à esquerda, palco no meio, grupo à
 * direita. No celular isso não existe: as três viram uma pilha, na ordem de
 * cima. O palco atravessa as colunas porque é a peça larga — espremê-lo em um
 * terço faria as plataformas sumirem, que é o oposto do que ele serve.
 */
export function Lobby({
  esquadrao,
  membros,
  sessoes,
  recados,
  fichas,
  meuPerfilId,
  capacidade,
}: {
  esquadrao: Squad
  membros: readonly SquadMember[]
  sessoes: readonly SquadSession[]
  recados: readonly SquadPing[]
  fichas: ReadonlyArray<{ id: string; nome: string }>
  meuPerfilId: string
  capacidade: number
}) {
  const eu = membros.find((m) => m.souEu) ?? null
  const souDono = eu?.papel === 'OWNER'
  const pronto = prontidao(membros)

  const ranking = rankingDaSemana(membros)
  const escondidos = foraDoRanking(membros)
  const maximo = Math.max(1, ...ranking.map((m) => m.diasNaSemana ?? 0))

  return (
    <div className="space-y-4">
      <Palco membros={membros} capacidade={capacidade} />

      <BarraDeProntidao
        inicial={eu?.presenca ?? null}
        prontos={pronto.prontos}
        total={pronto.total}
        faltam={pronto.faltam}
        restantes={pronto.restantes}
      />

      {/*
        Daqui para baixo, duas colunas em tela larga: o combinado de um lado,
        o grupo do outro. No celular continua uma pilha só.
      */}
      {/*
        `min-w-0` nos dois: item de grade nasce com `min-width: auto`, que é o
        min-content do conteúdo — e basta um filho que não encolhe para a
        coluna inteira ficar mais larga que a tela. No celular isso virou 463px
        de página numa janela de 390, com rolagem lateral no app inteiro.
        Medido no navegador.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
              <CalendarClock className="size-4 text-synse-primary" aria-hidden />
              Treinos marcados
            </h2>

            {sessoes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-synse-border p-4 text-sm text-synse-muted">
                Nada marcado. Combine o próximo e todo mundo recebe o aviso.
              </p>
            ) : (
              sessoes.map((sessao) => (
                <CartaoDoTreino
                  key={sessao.id}
                  sessao={sessao}
                  /* Quem marcou, ou o dono — a mesma regra do banco (0068). */
                  podeCancelar={sessao.criadoPor === meuPerfilId || souDono}
                />
              ))
            )}

            <MarcarTreino squadId={esquadrao.id} fichas={fichas} />
          </section>

          <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
            <h2 className="text-sm font-semibold text-synse-text">A semana do esquadrão</h2>
            <p className="mt-0.5 text-xs text-synse-muted">Dias treinados de segunda até hoje.</p>

            <ol className="mt-3 space-y-2">
              {ranking.map((membro, posicao) => (
                <li key={membro.profileId} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-synse-muted">
                    {posicao + 1}
                  </span>
                  <span
                    className={cn(
                      'w-24 shrink-0 truncate text-sm text-synse-text',
                      membro.souEu && 'font-semibold',
                    )}
                  >
                    {membro.souEu ? 'Você' : membro.nome.split(' ')[0]}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-synse-surface-2">
                    <span
                      className="block h-full rounded-full bg-synse-primary"
                      style={{
                        width: `${Math.round(((membro.diasNaSemana ?? 0) / maximo) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-synse-muted">
                    {membro.diasNaSemana} {membro.diasNaSemana === 1 ? 'dia' : 'dias'}
                  </span>
                </li>
              ))}
            </ol>

            {/*
              Quem não autorizou não vira uma linha com traço no lugar do
              número: isso é cobrança pública por uma escolha privada. A frase
              conta quantos são, sem nome.
            */}
            {escondidos > 0 && (
              <p className="mt-3 text-xs text-synse-muted">
                {escondidos === 1
                  ? '1 pessoa do esquadrão preferiu não aparecer no ranking.'
                  : `${escondidos} pessoas do esquadrão preferiram não aparecer no ranking.`}{' '}
                É escolha de cada um, em Perfil → Privacidade.
              </p>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <Recados
            squadId={esquadrao.id}
            iniciais={recados}
            meuNome={eu?.nome ?? 'Você'}
          />
          <QuemEDoEsquadrao esquadrao={esquadrao} membros={membros} souDono={souDono} />
          <CodigoDoEsquadrao esquadrao={esquadrao} souDono={souDono} capacidade={capacidade} />
        </div>
      </div>
    </div>
  )
}
