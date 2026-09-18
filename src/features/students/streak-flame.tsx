import Image from 'next/image'

import { cn } from '@/lib/utils'
import type { Sequencia } from '@/features/students/streak'

/**
 * A chama da sequência, ao lado do nome.
 *
 * Substituiu o emoji de mãozinha que estava ali. Emoji é desenhado pelo sistema
 * operacional — muda de cara entre Android, iPhone e Windows, e não é do
 * produto. Esta é a arte da marca, ao lado de um número que significa alguma
 * coisa: quantos dias seguidos a pessoa apareceu.
 *
 * ── Por que imagem e não SVG ────────────────────────────────────────────────
 *
 * A primeira versão foi um SVG desenhado à mão, que pesava quase nada e
 * acompanhava o tema. Esta é a arte de verdade, recortada do original: as
 * camadas translúcidas e o degradê de dentro não se reproduzem em dois traços
 * de `path`. Custa 11 KB, servidos uma vez e cacheados.
 *
 * O recorte guarda só o corpo da chama, sem o halo do original. O halo é lindo
 * sobre preto e vira névoa sobre branco — e o app tem tema claro. O brilho
 * volta aqui no CSS, que sabe em qual tema está.
 *
 * ── Os dois estados ─────────────────────────────────────────────────────────
 *
 * **Acesa** quando já treinou hoje. **Fria** quando a sequência está viva e o
 * dia ainda não aconteceu: é o empurrão sem susto — a pessoa vê que tem algo a
 * perder, e o número continua lá.
 *
 * Sequência zerada não desenha nada. Um "0" ao lado do nome de quem está
 * voltando à academia é um lembrete diário de que ela parou.
 */
export function StreakFlame({ sequencia }: { sequencia: Sequencia }) {
  if (sequencia.dias === 0) return null

  const acesa = sequencia.hoje

  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={
        acesa
          ? `${sequencia.dias} dias seguidos de treino`
          : `${sequencia.dias} dias seguidos. Treine hoje para não perder a sequência.`
      }
    >
      <Image
        src="/synse-chama.webp"
        alt=""
        width={103}
        height={168}
        /*
         * `priority` porque ela fica no cabeçalho da tela inicial, acima da
         * dobra: carregada preguiçosamente, apareceria depois do nome e daria
         * um pulo no texto.
         */
        priority
        className={cn(
          'h-7 w-auto shrink-0 transition',
          acesa
            ? // Brilho no escuro; no claro, um contorno que separa o quase-branco
              // do miolo da chama do fundo da página.
              'drop-shadow-[0_0_5px_rgba(23,196,165,0.55)] dark:drop-shadow-[0_0_7px_var(--synse-primary)]'
            : // Fria perde cor, não tamanho: encolher mexeria na linha de base
              // do nome ao lado a cada dia.
              'opacity-55 grayscale-[0.55]',
        )}
      />

      <span className="text-base font-semibold tabular-nums text-synse-text">
        {sequencia.dias}
      </span>
      <span className="sr-only">
        {sequencia.dias === 1 ? 'dia seguido de treino' : 'dias seguidos de treino'}
      </span>
    </span>
  )
}
