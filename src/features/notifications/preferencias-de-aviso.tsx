'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { BellRing, ChevronDown, Smartphone } from 'lucide-react'

import { Switch } from '@/components/ui/switch'
import { definirPreferenciaDeAvisoAction } from '@/features/notifications/preferencias-actions'
import { estadoDasCategorias } from '@/features/notifications/preferencias-state'
import { cn } from '@/lib/utils'
import type { NotificationCategory, NotificationPreference } from '@/types/domain'

/**
 * ── O que eu quero receber ───────────────────────────────────────────────────
 *
 * A central mostrava tudo e não deixava controlar nada: quem não queria saber
 * de cada conteúdo publicado tinha duas opções — aguentar, ou desligar o push
 * inteiro e perder junto o aviso de cobrança.
 *
 * ── Fechado por padrão ───────────────────────────────────────────────────────
 *
 * O conteúdo desta tela é o feed; isto é configuração. Num `<details>`, que
 * abre e fecha sem JavaScript e já vem com o papel certo para leitor de tela —
 * e o resumo diz quantas estão desligadas, para quem esqueceu não precisar
 * abrir para descobrir.
 *
 * ── O interruptor muda na hora, e volta se o servidor recusar ────────────────
 *
 * Esperar a ida ao servidor para mover o botão faz a tela parecer travada no
 * celular da academia. Então ele move primeiro — e desfaz se a resposta vier
 * negativa, porque um interruptor que ficou ligado sem ter ligado é pior que
 * um que demorou.
 */
export function PreferenciasDeAviso({ preferencias }: { preferencias: NotificationPreference[] }) {
  const inicial = estadoDasCategorias(preferencias)
  const [estado, setEstado] = useState(
    () => new Map(inicial.map((c) => [c.valor, c.ligada] as const)),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  const desligadas = [...estado.values()].filter((ligada) => !ligada).length

  function alternar(categoria: NotificationCategory, ligada: boolean) {
    setErro(null)
    setEstado((atual) => new Map(atual).set(categoria, ligada))

    iniciar(async () => {
      const resultado = await definirPreferenciaDeAvisoAction(categoria, ligada)
      if (!resultado.ok) {
        setEstado((atual) => new Map(atual).set(categoria, !ligada))
        setErro(resultado.erro ?? 'Não deu para salvar.')
      }
    })
  }

  return (
    <details className="group rounded-2xl border border-synse-border bg-synse-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <BellRing className="size-4 shrink-0 text-synse-muted" aria-hidden />
        <span className="flex-1">
          <span className="block text-sm font-medium text-synse-text">O que você quer receber</span>
          <span className="block text-xs text-synse-muted">
            {desligadas === 0
              ? 'Tudo ligado'
              : `${desligadas} ${desligadas > 1 ? 'categorias desligadas' : 'categoria desligada'}`}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-synse-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="space-y-1 border-t border-synse-border p-2">
        {inicial.map((categoria) => {
          const ligada = estado.get(categoria.valor) ?? true
          return (
            <label
              key={categoria.valor}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl p-3',
                'hover:bg-synse-surface-2',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-synse-text">
                  {categoria.rotulo}
                </span>
                <span className="block text-xs text-synse-muted">{categoria.ajuda}</span>
              </span>
              <Switch
                checked={ligada}
                onCheckedChange={(valor) => alternar(categoria.valor, valor)}
                aria-label={`Avisos de ${categoria.rotulo}`}
              />
            </label>
          )
        })}

        {erro && (
          <p role="alert" className="px-3 pb-2 text-xs text-synse-danger">
            {erro}
          </p>
        )}

        {/*
         * O push é outro canal: estes interruptores governam o que entra na
         * central, e o do celular governa se o aparelho toca. Ele mora na
         * conta, junto de senha e sair — e o elo evita a terceira tela onde
         * procurar.
         */}
        <Link
          href="/app/profile"
          className="flex items-center gap-2 rounded-xl p-3 text-xs text-synse-muted hover:bg-synse-surface-2"
        >
          <Smartphone className="size-3.5 shrink-0" aria-hidden />
          Avisos no celular, com o app fechado, ficam na sua conta
        </Link>
      </div>
    </details>
  )
}
