'use client'

import type { NivelSynse } from '@/features/students/level'
import { ESTAGIOS } from '@/features/students/plant'
import { cn } from '@/lib/utils'

/**
 * ⚠️ TEMPORÁRIO — o seletor de estágio do jardim.
 *
 * Existe para o dono do produto conferir os cinco estágios da planta sem ter
 * que treinar até o nível 12. Fica escondido atrás de `?jardim=previa`: quem
 * abre o perfil pelo aplicativo nunca vê isto.
 *
 * ── Por que não mexer no nível da conta ─────────────────────────────────────
 *
 * O nível não existe como coluna: ele é calculado dos treinos, quilômetros e
 * medalhas, toda vez. Para "subir o nível" de alguém seria preciso inventar
 * treinos no histórico real — e aí a sequência, os recordes, o gráfico das
 * últimas quatro semanas e os números que a academia vê passariam todos a
 * mentir junto. Esta prévia não grava nada: ela só troca o que a tela desenha.
 *
 * ── Como remover ────────────────────────────────────────────────────────────
 *
 * Apagar este arquivo, a prop `previa` em `PainelPlanta` e a leitura de
 * `searchParams` em `app/profile/page.tsx`. Três lugares, nenhum deles no
 * banco.
 */
export function SeletorDeEstagio({
  nivelEscolhido,
  aoEscolher,
  nivelReal,
}: {
  nivelEscolhido: number | null
  aoEscolher: (nivel: number | null) => void
  nivelReal: number
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-white/25 p-2">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-white/45">Prévia</span>

      <button
        type="button"
        onClick={() => aoEscolher(null)}
        className={cn(
          'rounded-md px-2 py-1 text-[11px] transition-colors',
          nivelEscolhido === null
            ? 'bg-synse-primary/25 text-synse-primary-light'
            : 'text-white/60 hover:bg-white/10',
        )}
      >
        Real ({nivelReal})
      </button>

      {ESTAGIOS.map((estagio) => (
        <button
          key={estagio.chave}
          type="button"
          onClick={() => aoEscolher(estagio.nivelMinimo)}
          className={cn(
            'rounded-md px-2 py-1 text-[11px] transition-colors',
            nivelEscolhido === estagio.nivelMinimo
              ? 'bg-synse-primary/25 text-synse-primary-light'
              : 'text-white/60 hover:bg-white/10',
          )}
        >
          {estagio.nome}
        </button>
      ))}
    </div>
  )
}

/** O nível fingido da prévia. Só o número e o progresso importam para a planta. */
export function nivelDePrevia(real: NivelSynse, nivel: number): NivelSynse {
  return { ...real, nivel, progresso: 0.45 }
}
