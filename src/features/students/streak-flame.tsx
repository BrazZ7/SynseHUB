import { cn } from '@/lib/utils'
import type { Sequencia } from '@/features/students/streak'

/**
 * A chama da sequência, ao lado do nome.
 *
 * Substituiu o emoji de mãozinha que estava ali. Um emoji é desenhado pelo
 * sistema operacional — muda de cara entre Android, iPhone e Windows, e não é
 * do produto. Esta chama é um SVG do Synse, com o verde da marca, e significa
 * alguma coisa: quantos dias seguidos a pessoa apareceu.
 *
 * ── Os dois estados ─────────────────────────────────────────────────────────
 *
 * **Acesa** quando já treinou hoje: a chama tem o brilho completo.
 * **Fria** quando a sequência está viva mas o dia ainda não aconteceu. É o
 * empurrão sem susto — a pessoa vê que tem algo a perder, e o número continua
 * lá.
 *
 * Sequência zerada não desenha nada. Um "0" ao lado do nome de quem está
 * voltando à academia é um lembrete diário de que ela parou.
 */

const GRADIENTE = 'synse-chama'

export function StreakFlame({ sequencia }: { sequencia: Sequencia }) {
  if (sequencia.dias === 0) return null

  const acesa = sequencia.hoje

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 align-middle',
        // A chama fria perde saturação, não tamanho: encolher mudaria a linha
        // de base do texto ao lado a cada dia.
        !acesa && 'opacity-60 saturate-50',
      )}
      title={
        acesa
          ? `${sequencia.dias} dias seguidos de treino`
          : `${sequencia.dias} dias seguidos. Treine hoje para não perder a sequência.`
      }
    >
      <svg
        viewBox="0 0 24 24"
        className={cn('size-6 shrink-0', acesa && 'drop-shadow-[0_0_6px_var(--synse-primary)]')}
        role="img"
        aria-label="Sequência de treinos"
      >
        <defs>
          <linearGradient id={GRADIENTE} x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="var(--synse-primary)" />
            <stop offset="55%" stopColor="var(--synse-primary-light)" />
            <stop offset="100%" stopColor="#D9FFF4" />
          </linearGradient>
        </defs>

        {/* A língua externa: sobe e enrola para dentro, como no desenho da marca. */}
        <path
          fill={`url(#${GRADIENTE})`}
          d="M13.1 1.8c.4 2.6-.5 4.5-2 6.2-1.7 1.9-3.9 3.4-4.9 6-1.4 3.6.6 7.6 4.2 8.8-1.1-1.6-1.3-3.4-.5-5.1.7-1.5 2-2.6 3-3.9 1.2-1.6 1.8-3.3 1.5-5.3 1.9 1.5 3.1 3.4 3.4 5.7.5 3.8-1.6 7.2-5 8.5 4.2-.3 7.4-3.6 7.6-7.8.2-4.1-2.4-7-5-9.4-.9-.9-1.8-1.8-2.3-3.7Z"
        />
        {/* O núcleo claro, que dá o brilho de dentro. */}
        <path
          fill="#EAFFF9"
          opacity={acesa ? 0.9 : 0.55}
          d="M11.6 12.6c.7 1 .6 2.1.1 3.1-.4.8-1 1.5-1 2.5 0 1.2.9 2.2 2.1 2.4-1.9.2-3.6-1.1-3.9-3-.3-1.8.9-3.2 1.9-4.4.3-.3.6-.6.8-.6Z"
        />
      </svg>

      <span className="text-base font-semibold tabular-nums text-synse-text">
        {sequencia.dias}
      </span>
      <span className="sr-only">
        {sequencia.dias === 1 ? 'dia seguido de treino' : 'dias seguidos de treino'}
      </span>
    </span>
  )
}
