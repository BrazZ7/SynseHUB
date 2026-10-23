import Link from 'next/link'
import { History, LineChart, Scale, Users } from 'lucide-react'

/**
 * ── As portas do Progresso ──────────────────────────────────────────────────
 *
 * Amigos, Histórico, Análise e Synse Body são a mesma família — acompanhar o
 * que mudou —, e por isso moram aqui e não na barra de baixo, que já tem cinco
 * itens.
 *
 * ── Por que elas desceram, e encolheram ─────────────────────────────────────
 *
 * Eram três linhas largas no **topo** da tela, cada uma com ícone, título,
 * duas linhas de texto e uma seta. Juntas ocupavam a primeira tela inteira: a
 * página chamada "Seu progresso" abria com um menu, e o dado da pessoa só
 * começava abaixo da dobra.
 *
 * Agora são alvos de toque numa fileira só, no rodapé. Perdem a frase
 * explicativa, e tudo bem: quem já esteve lá reconhece pelo nome, e quem não
 * esteve descobre entrando — o custo de um toque errado aqui é voltar.
 */

const PORTAS = [
  { href: '/app/historico', icone: History, nome: 'Histórico' },
  { href: '/app/friends', icone: Users, nome: 'Amigos' },
  { href: '/app/progress/analise', icone: LineChart, nome: 'Análise' },
  { href: '/app/corpo', icone: Scale, nome: 'Synse Body' },
] as const

export function PortasDoProgresso() {
  return (
    /*
     * Quatro colunas, e não duas linhas de duas: o histórico entrou e o
     * rodapé não pode dobrar de altura — a razão de estas portas terem
     * descido para cá foi devolver a primeira tela ao dado da pessoa. A
     * pílula fica mais estreita; `leading-tight` e `min-h-24` absorvem o nome
     * que quebra em duas linhas.
     */
    <nav aria-label="Mais sobre o seu progresso" className="grid grid-cols-4 gap-2">
      {PORTAS.map(({ href, icone: Icone, nome }) => (
        <Link
          key={href}
          href={href}
          /*
           * `min-h-24` em vez de só padding: alvo de toque com altura
           * garantida mesmo que o nome caiba numa linha só, para as pílulas
           * não ficarem de alturas diferentes.
           */
          className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-synse-border bg-synse-surface p-3 text-center shadow-synse-sm transition-colors hover:bg-synse-surface-2"
        >
          <Icone className="size-5 text-synse-primary" aria-hidden />
          <span className="text-xs font-medium leading-tight text-synse-text">{nome}</span>
        </Link>
      ))}
    </nav>
  )
}
