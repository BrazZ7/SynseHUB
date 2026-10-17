import { Droplets } from 'lucide-react'
import type { ReactNode } from 'react'

import { Cachoeira } from '@/features/nutrition/components/cachoeira'
import { CascaDoQuadro } from '@/features/nutrition/components/casca-do-quadro'

/**
 * ── O quadro das refeições ──────────────────────────────────────────────────
 *
 * Eram cinco cartões iguais empilhados, e cinco cartões iguais não dizem que
 * são um dia — dizem que são cinco coisas. Aqui é um quadro só, e os horários
 * descem por uma calha de água: a ordem passa a ser o assunto, em vez de um
 * detalhe no canto de cada cartão.
 *
 * ── Por que o layout é compartilhado ────────────────────────────────────────
 *
 * O plano base e o plano prescrito mostram a mesma coisa — um dia de refeições
 * em ordem — e só o miolo de cada linha difere: o base traz uma sugestão e
 * trocas, o prescrito traz os itens com a conta de calorias. Fosse o quadro
 * exclusivo do base, o aluno **atendido por nutricionista** — o caso melhor —
 * ficaria com a tela pior. Então o quadro é um só e o miolo vem de fora.
 */
export type RefeicaoDoQuadro = {
  /** Chave de lista. O nome não serve: dois lanches podem repetir o rótulo. */
  chave: string
  nome: string
  /** Nulo é legítimo: refeição prescrita pode não ter horário marcado. */
  horario: string | null
  corpo: ReactNode
}

export function QuadroDasRefeicoes({ refeicoes }: { refeicoes: RefeicaoDoQuadro[] }) {
  const comHorario = refeicoes.map((r) => r.horario).filter((h): h is string => Boolean(h))
  const primeiro = comHorario[0]
  const ultimo = comHorario[comHorario.length - 1]

  return (
    /*
     * `.dark` no quadro, e não na página: a cachoeira é noturna nos dois temas,
     * e sem isto o texto sairia escuro sobre escuro para quem usa o claro.
     *
     * A casca é componente de cliente só por causa do toque — ver o porquê lá.
     */
    <CascaDoQuadro className="dark overflow-hidden rounded-2xl border border-white/10 bg-synse-gradient-deep shadow-synse-lg motion-safe:hover:[--pressa:0.55]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-white">
          <Droplets className="size-4 text-synse-mint" aria-hidden />O dia inteiro
        </h2>
        {/* Só quando há duas pontas distintas: `07h — 07h` não informa nada. */}
        {primeiro && ultimo && primeiro !== ultimo && (
          <span className="text-xs tabular-nums text-white/55">
            {primeiro} — {ultimo}
          </span>
        )}
      </header>

      {/*
        A cachoeira começa **abaixo** do cabeçalho, e não no topo do quadro:
        assim a água sai de debaixo da borda, como de uma soleira, e o título
        não fica sobre fio em movimento.
      */}
      <div className="relative">
        {/* A largura da calha e a da coluna da grade precisam bater. */}
        <Cachoeira className="absolute inset-y-0 left-0 w-[4.75rem] sm:w-[6.5rem]" />

        <ol className="relative">
          {refeicoes.map((refeicao) => (
            <li
              key={refeicao.chave}
              className="grid grid-cols-[4.75rem_1fr] items-start gap-x-1 border-t border-white/[0.06] py-4 pr-5 first:border-t-0 last:pb-6 sm:grid-cols-[6.5rem_1fr]"
            >
              {/*
                O horário é vidro fosco sobre a água: `backdrop-blur` borra o
                fio que passa atrás, que é o que separa vidro de retângulo
                translúcido — e é também o que garante o contraste do texto,
                porque o que fica atrás dele deixa de ter detalhe.

                Sem horário sobra o nó: a refeição continua sendo um degrau da
                calha, só não diz a que hora. Um espaço vazio quebraria a
                coluna no meio.
              */}
              {refeicao.horario ? (
                <span className="mx-auto w-fit rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur-md">
                  {refeicao.horario}
                </span>
              ) : (
                <span
                  aria-hidden
                  className="mx-auto mt-1.5 block size-2 rounded-full border border-white/30 bg-white/20 backdrop-blur-md"
                />
              )}

              <div>
                <h3 className="text-sm font-medium text-white">{refeicao.nome}</h3>
                {refeicao.corpo}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </CascaDoQuadro>
  )
}
