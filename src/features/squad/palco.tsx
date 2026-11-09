import { Crown, Plus } from 'lucide-react'

import { iniciais, ordenarLobby, rotuloDaPresenca } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { PresenceState, SquadMember } from '@/types/domain'

/**
 * ── O palco ─────────────────────────────────────────────────────────────────
 *
 * As pessoas do esquadrão em pé sobre plataformas acesas, com o nome e o
 * estado num chip acima. É a imagem que o dono do produto pediu, e a razão de
 * ela funcionar é a mesma de um lobby de jogo: **o grupo aparece como grupo**,
 * lado a lado, em vez de virar uma lista com bolinhas de status.
 *
 * ── A vaga vazia faz parte ──────────────────────────────────────────────────
 *
 * As plataformas apagadas não são enfeite: elas mostram que o esquadrão tem
 * lugar. Uma lista de três nomes não diz "cabe mais gente"; três pessoas e uma
 * plataforma vazia com um "+" dizem, sem uma palavra.
 *
 * Mostramos no máximo duas vagas — oito plataformas num celular viram
 * oito pontos minúsculos, e o convite se repete no painel ao lado.
 *
 * ── Por que não há foto de corpo inteiro ────────────────────────────────────
 *
 * A referência tem gente de pé, renderizada. Aqui são avatares: o produto tem
 * a foto de perfil, que é pequena e redonda, e inventar um boneco por pessoa
 * seria mostrar um corpo que não é o dela — num app de academia, isso tem peso.
 * A plataforma, o chip e a luz fazem o trabalho da imagem.
 */

const PLATAFORMA: Record<PresenceState, string> = {
  TREINANDO: 'bg-synse-primary/80 shadow-[0_0_28px_6px_rgba(0,169,143,0.55)]',
  CHEGUEI: 'bg-synse-primary/60 shadow-[0_0_22px_4px_rgba(0,169,143,0.4)]',
  A_CAMINHO: 'bg-amber-400/50 shadow-[0_0_18px_3px_rgba(251,191,36,0.35)]',
  TERMINEI: 'bg-white/20',
}

const ANEL: Record<PresenceState, string> = {
  TREINANDO: 'ring-synse-primary-light',
  CHEGUEI: 'ring-synse-primary',
  A_CAMINHO: 'ring-amber-400/80',
  TERMINEI: 'ring-white/30',
}

function Figura({ membro }: { membro: SquadMember }) {
  const estado = rotuloDaPresenca(membro.presenca)
  const aceso = membro.presenca === 'CHEGUEI' || membro.presenca === 'TREINANDO'

  return (
    <li className="flex w-[84px] shrink-0 flex-col items-center gap-2">
      {/* O chip, acima — como na referência: nome em cima, pessoa embaixo. */}
      <div
        className={cn(
          'flex max-w-full items-center gap-1 rounded-full border px-2 py-1 backdrop-blur',
          aceso ? 'border-synse-primary/50 bg-white/10' : 'border-white/15 bg-white/5',
        )}
      >
        {membro.papel === 'OWNER' && (
          <Crown className="size-3 shrink-0 text-amber-300" aria-label="Dono" />
        )}
        <span className="min-w-0 truncate text-[11px] font-semibold text-white">
          {membro.souEu ? 'Você' : membro.nome.split(' ')[0]}
        </span>
      </div>

      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white ring-2 backdrop-blur transition-opacity',
          membro.presenca ? ANEL[membro.presenca] : 'opacity-40 ring-white/10',
        )}
      >
        {iniciais(membro.nome)}
      </div>

      {/*
        A plataforma. Elipse e não círculo: ela é o chão visto de frente, e um
        círculo perfeito leria como uma bolha flutuando atrás da pessoa.
      */}
      <div className="relative h-4 w-[72px]">
        <div
          className={cn(
            'absolute inset-0 rounded-[50%]',
            membro.presenca ? PLATAFORMA[membro.presenca] : 'bg-white/10',
            // Só quem está lá respira. Quem terminou ou não avisou fica parado.
            aceso && 'motion-safe:animate-plataforma',
          )}
        />
      </div>

      <p className="h-4 w-full truncate text-center text-[10px] text-white/70">{estado ?? ''}</p>
    </li>
  )
}

/** A plataforma apagada: o lugar que ainda cabe gente. */
function Vaga() {
  return (
    <li className="flex w-[84px] shrink-0 flex-col items-center gap-2">
      <div className="h-[26px]" aria-hidden />
      <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-white/25 text-white/40">
        <Plus className="size-5" aria-hidden />
      </div>
      <div className="relative h-4 w-[72px]">
        <div className="absolute inset-0 rounded-[50%] border border-dashed border-white/20" />
      </div>
      <p className="h-4 w-full truncate text-center text-[10px] text-white/50">Vaga</p>
    </li>
  )
}

export function Palco({
  membros,
  capacidade,
}: {
  membros: readonly SquadMember[]
  capacidade: number
}) {
  const ordenados = ordenarLobby(membros)
  const vagas = Math.min(2, Math.max(0, capacidade - membros.length))

  return (
    <section className="relative overflow-hidden rounded-3xl bg-synse-gradient-deep p-5 shadow-synse-lg">
      {/* O brilho de fundo, atrás de tudo: dá profundidade sem pesar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-synse-primary/20 blur-3xl"
      />

      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
          Sala do esquadrão
        </p>

        {/*
          Rolagem lateral: oito plataformas não cabem na largura de um celular,
          e quebrar em duas linhas faria o palco crescer e empurrar o resto da
          tela para baixo. As margens negativas deixam a rolagem ir até a borda.
        */}
        {/*
          Centralizado só na tela larga. Com `overflow-x-auto`, centralizar um
          conteúdo que transborda corta o começo dele — e no celular ele
          transborda sempre. Na largura de `lg`, oito plataformas cabem com
          folga, então ali o centro é seguro e o palco deixa de ficar encostado
          na borda esquerda com meio metro de vazio à direita.
        */}
        <ul className="-mx-5 mt-4 flex items-end gap-2 overflow-x-auto px-5 pb-1 lg:justify-center">
          {ordenados.map((membro) => (
            <Figura key={membro.profileId} membro={membro} />
          ))}
          {Array.from({ length: vagas }, (_, i) => (
            <Vaga key={`vaga-${i}`} />
          ))}
        </ul>
      </div>
    </section>
  )
}
