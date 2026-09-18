'use client'

import { Building2, Check, ChevronsUpDown, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { trocarContextoAction } from '@/features/platform/actions'
import type { ContextoDisponivel } from '@/features/platform/state'
import { cn } from '@/lib/utils'

/**
 * O seletor de contexto da conta de plataforma.
 *
 * Uma conta de plataforma enxerga toda academia — a RLS permite isso desde a
 * 0004, pela `is_super_admin()`. O que faltava era **dizer em qual delas ela
 * está agindo**: sem isso, o painel abria numa organização escolhida por um
 * `limit(1)` e não havia como ir para outra.
 *
 * ── Por que ele é sempre visível ────────────────────────────────────────────
 *
 * Quando a conta está dentro de uma academia de cliente, o seletor mostra o
 * nome dela em destaque. Não é enfeite: é a diferença entre saber e não saber
 * de quem são os dados na tela. Uma conta com esse alcance, agindo sem
 * indicação constante de onde está, é como se faz uma alteração na academia
 * errada acreditando estar na sua.
 */
export function ContextSwitcher({
  atual,
  opcoes,
  emAcademiaDeCliente,
}: {
  atual: string
  opcoes: ContextoDisponivel[]
  emAcademiaDeCliente: boolean
}) {
  const router = useRouter()
  const [trocando, iniciarTransicao] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const selecionada = opcoes.find((o) => o.valor === atual)

  function trocar(destino: string) {
    if (destino === atual) return
    setErro(null)
    iniciarTransicao(async () => {
      const resposta = await trocarContextoAction(destino)
      if (resposta.status === 'error') {
        setErro(resposta.message)
        return
      }
      /*
       * `push` e depois `refresh`. Só o refresh recarregaria a rota atual, e
       * quem estava no painel pedindo "conta pessoal" continuava no painel; só
       * o push reusaria o cache do cliente e mostraria a tela com os dados do
       * contexto anterior.
       */
      router.push(resposta.rota)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={trocando}
            className={cn(
              'max-w-[15rem] gap-2',
              // Dentro da academia de um cliente o botão fica marcado. É o
              // aviso permanente de que os dados na tela não são seus.
              emAcademiaDeCliente && 'border-synse-warning/60 bg-synse-warning/10',
            )}
          >
            {trocando ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="size-4 shrink-0 text-synse-primary" aria-hidden />
            )}
            <span className="truncate">{selecionada?.rotulo ?? 'Escolher contexto'}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-synse-muted">
            Conta de plataforma · agindo como
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {opcoes.map((opcao, i) => {
            const primeiraAcademia =
              opcao.tipo === 'ACADEMIA' && opcoes[i - 1]?.tipo !== 'ACADEMIA'

            return (
              <div key={opcao.valor}>
                {primeiraAcademia && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onSelect={() => trocar(opcao.valor)}
                  className="flex items-start gap-2"
                >
                  {opcao.tipo === 'PESSOAL' ? (
                    <UserRound className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <Building2 className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opcao.rotulo}</span>
                    {opcao.detalhe && (
                      <span className="block truncate text-xs text-synse-muted">
                        {opcao.detalhe}
                      </span>
                    )}
                  </span>
                  {opcao.valor === atual && (
                    <Check className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
                  )}
                </DropdownMenuItem>
              </div>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {erro && <p className="text-xs text-synse-danger">{erro}</p>}
    </div>
  )
}
