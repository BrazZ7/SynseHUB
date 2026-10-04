'use client'

import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * ── A casca do quadro ───────────────────────────────────────────────────────
 *
 * É só uma `<section>` com `--pressa`, e existe como componente de cliente por
 * um motivo específico: **`:active` não é confiável no toque**. No Safari do
 * iPhone o estado ativo só se aplica a elemento que já seja interativo, ou que
 * tenha ouvinte de toque — então `active:[--pressa:…]` numa seção comum
 * funciona no mouse e não funciona no telefone, que é onde o app do aluno é
 * usado. Prometer interação e entregar só no desktop é pior que não prometer.
 *
 * Os ouvintes de ponteiro cobrem mouse, caneta e dedo com um código só.
 * `onPointerCancel` é o que impede a água de disparar quando a pessoa está
 * apenas rolando a página: o navegador cancela o ponteiro no instante em que o
 * gesto vira rolagem, e a queda volta ao normal.
 *
 * O `hover` continua em CSS. Passar o mouse não é pressionar, e as duas coisas
 * têm pressas diferentes — o estilo em linha do toque vence o da folha de
 * estilos, que é a precedência correta: o dedo apertado apressa mais.
 */
export function CascaDoQuadro({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [apertado, setApertado] = useState(false)

  return (
    <section
      className={cn('group relative', className)}
      onPointerDown={() => setApertado(true)}
      onPointerUp={() => setApertado(false)}
      onPointerCancel={() => setApertado(false)}
      onPointerLeave={() => setApertado(false)}
      style={apertado ? ({ ['--pressa' as string]: '0.35' } as React.CSSProperties) : undefined}
    >
      {children}
    </section>
  )
}
