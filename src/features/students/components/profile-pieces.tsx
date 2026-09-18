import {
  Award,
  CalendarDays,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Lock,
  Medal,
  Mountain,
  Trophy,
  Weight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { Conquista } from '@/features/students/achievements'
import type { DiaDaSemana, RecordePessoal } from '@/features/students/profile-service'
import type { NivelSynse } from '@/features/students/level'
import { cn } from '@/lib/utils'

/** As peças do perfil. Sem estado: tudo vem calculado do servidor. */

// ── A arte da marca ──────────────────────────────────────────────────────────
/**
 * A capa do perfil.
 *
 * Mesma decisão da chama: é a arte do Synse, não um degradê que lembra o
 * Synse. Veio do material de marca do dono do produto, recortada da prancha de
 * assets — sem extração por luminância, que foi o que produziu o halo pálido
 * em volta da primeira chama.
 *
 * ── Por que uma faixa, e não o fundo do cartão ──────────────────────────────
 *
 * A arte é escura nos dois temas — é uma foto. Se ela fosse o fundo do cartão
 * inteiro, os botões de foto e o nome ficariam por cima dela, e no tema claro
 * o texto escuro sumiria no fundo escuro. Como faixa, a foto é foto e o
 * conteúdo continua sobre `bg-synse-surface`, legível nos dois temas.
 *
 * O degradê no pé costura a foto ao cartão: sem ele fica uma aresta dura entre
 * a noite da arte e a superfície da interface.
 */
export function CapaPerfil() {
  return (
    /*
     * A faixa tem a proporção exata do arquivo, então nada é cortado.
     *
     * A primeira versão fixava a altura e deixava o `object-cover` recortar as
     * laterais. Num celular de 390px sobravam 25px de folga horizontal, e
     * qualquer ancoragem fora do centro comia o logotipo: "SAÚDE" aparecia
     * como "AÚDE". Com a proporção travada não há folga para gastar.
     */
    <div className="relative aspect-[912/211] w-full overflow-hidden">
      <Image
        src="/synse-capa-perfil.webp"
        alt=""
        aria-hidden
        width={912}
        height={211}
        /* Fica acima da dobra do perfil: carregada preguiçosamente, ela
           apareceria depois e empurraria o resto da tela. */
        priority
        sizes="(max-width: 512px) 100vw, 512px"
        className="size-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-synse-surface to-transparent"
      />
    </div>
  )
}

// ── Números do topo ──────────────────────────────────────────────────────────
export function StatTile({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: LucideIcon
  valor: string
  rotulo: string
}) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-4">
      <Icone className="size-5 text-synse-primary" aria-hidden />
      <p className="mt-2 text-xl font-semibold tabular-nums text-synse-text">{valor}</p>
      <p className="text-xs text-synse-muted">{rotulo}</p>
    </div>
  )
}

export const ICONES_DO_TOPO = { Dumbbell, Footprints, Trophy, Medal }

// ── Nível ────────────────────────────────────────────────────────────────────
/**
 * O nível é derivado do histórico, e a tela diz isso.
 *
 * Sem a frase, o número parece um saldo que alguém guardou — e a primeira
 * pergunta vira "por que meu XP mudou?". Dizer de onde ele vem transforma a
 * dúvida em algo que a pessoa consegue conferir sozinha.
 */
export function NivelCard({ nivel }: { nivel: NivelSynse }) {
  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5">
      <h2 className="text-sm font-semibold text-synse-text">Seu nível Synse</h2>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold text-synse-text">Nível {nivel.nivel}</p>
        <p className="text-sm tabular-nums text-synse-muted">
          {nivel.xpNoNivel.toLocaleString('pt-BR')} / {nivel.xpDoNivel.toLocaleString('pt-BR')} XP
        </p>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-synse-bg"
        role="progressbar"
        aria-valuenow={Math.round(nivel.progresso * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso do nível ${nivel.nivel}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-synse-primary to-synse-primary-light"
          style={{ width: `${Math.round(nivel.progresso * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-synse-muted">
        Faltam {nivel.falta.toLocaleString('pt-BR')} XP para o próximo nível.
      </p>
      <p className="mt-1 text-[11px] text-synse-muted">
        Seu XP vem do que você fez: treinos, quilômetros e medalhas.
      </p>
    </section>
  )
}

// ── Conquistas ───────────────────────────────────────────────────────────────
const ICONE_DA_CONQUISTA: Record<Conquista['icone'], LucideIcon> = {
  treino: Dumbbell,
  corrida: Footprints,
  chama: Flame,
  montanha: Mountain,
  trofeu: Trophy,
  peso: Weight,
}

export function ConquistaHex({ conquista }: { conquista: Conquista }) {
  const Icone = conquista.conquistada ? ICONE_DA_CONQUISTA[conquista.icone] : Lock

  return (
    <li className="flex w-20 shrink-0 flex-col items-center gap-2 text-center">
      <span
        title={conquista.conquistada ? conquista.descricao : (conquista.progresso ?? '')}
        className={cn(
          'grid size-16 place-items-center rounded-2xl border',
          conquista.conquistada
            ? 'border-synse-primary/40 bg-synse-primary/10 text-synse-primary shadow-[0_0_18px_-6px_var(--synse-primary)]'
            : // Tracejada e sem cor: a que falta precisa parecer o que é.
              'border-dashed border-synse-border bg-synse-bg text-synse-muted',
        )}
      >
        <Icone className="size-7" aria-hidden />
      </span>
      <span className="text-[11px] leading-tight text-synse-muted">
        {conquista.conquistada ? conquista.nome : (conquista.progresso ?? 'Em breve')}
      </span>
    </li>
  )
}

// ── Evolução ─────────────────────────────────────────────────────────────────
/**
 * Sete colunas sempre, inclusive as vazias.
 *
 * Mesma razão do gráfico do SynseRun: um gráfico que só desenha os dias
 * treinados esconde exatamente o que a pessoa foi procurar ali — em quais dias
 * ela não aparece.
 */
export function SemanaChart({ dias }: { dias: DiaDaSemana[] }) {
  const maior = Math.max(1, ...dias.map((d) => d.treinos))

  return (
    <div className="flex h-36 items-end justify-between gap-1.5">
      {dias.map((dia) => (
        <div key={dia.rotulo} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div
            className="w-full rounded-t bg-gradient-to-t from-synse-primary/50 to-synse-primary"
            style={{ height: `${Math.max(4, (dia.treinos / maior) * 100)}%` }}
            title={`${dia.rotulo}: ${dia.treinos} ${dia.treinos === 1 ? 'treino' : 'treinos'}`}
          />
          <span className="text-[10px] text-synse-muted">{dia.rotulo}</span>
        </div>
      ))}
    </div>
  )
}

export function RecordeRow({ recorde }: { recorde: RecordePessoal }) {
  const Icone = ICONE_DO_RECORDE[recorde.rotulo] ?? Award

  return (
    <li className="flex items-center gap-3 rounded-lg border border-synse-border bg-synse-bg px-3 py-2.5">
      <Icone className="size-4 shrink-0 text-synse-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs text-synse-muted">{recorde.rotulo}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-text">
        {recorde.valor}
      </span>
    </li>
  )
}

const ICONE_DO_RECORDE: Record<string, LucideIcon> = {
  'Maior distância': Footprints,
  'Melhor pace': Gauge,
  'Maior carga': Weight,
  'Maior sequência': CalendarDays,
}
