'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dumbbell, Footprints, Home, TrendingUp, UserRound } from 'lucide-react'

import { BRAND } from '@/config/app'
import { cn } from '@/lib/utils'

/*
 * Cinco destinos, e o do meio é a marca.
 *
 * O SynseRun entra no lugar do Synse+, que era a única aba de venda numa barra
 * de uso diário — quem abre o app para treinar não vem comprar. O Synse+
 * continua a um toque, no cartão da tela inicial.
 *
 * Três à esquerda e dois à direita do disco, na ordem em que sempre
 * estiveram. Mudar a ordem para ficar simétrico custaria a memória motora de
 * quem já usa o app — o polegar aprende posição, não símbolo.
 */
const ITENS = [
  { href: '/app', label: 'Hoje', icon: Home, lado: 'esquerda' },
  { href: '/app/workout', label: 'Treino', icon: Dumbbell, lado: 'esquerda' },
  { href: '/app/run', label: 'Correr', icon: Footprints, lado: 'esquerda' },
  { href: '/app/progress', label: 'Progresso', icon: TrendingUp, lado: 'direita' },
  { href: '/app/profile', label: 'Perfil', icon: UserRound, lado: 'direita' },
] as const

/**
 * Navegação principal do Synse App.
 *
 * ── Aberta, sempre ──────────────────────────────────────────────────────────
 *
 * A barra ficava **recolhida por padrão**: em repouso só o disco da marca
 * aparecia, e tocar nele abria a pílula com um recorte do centro para fora, os
 * ícones saindo em leque, o disco girando 540° e doze gotas de respingo.
 *
 * Saiu inteiro, por pedido de quem manda no produto. Vale registrar o que se
 * ganha, porque foi exatamente o custo que a versão anterior pagava: **chegar
 * a qualquer aba volta a ser um toque, e não dois.** Numa barra de uso diário
 * isso é o que importa — o gesto da marca era bonito uma vez e pedágio nas
 * outras cinquenta.
 *
 * O disco continua no meio, e continua sendo o vão de 72px que o layout abre
 * para ele. O que ele não é mais é botão: sem barra para abrir, um botão que
 * só gira é um controle que não controla nada. Virou o que sempre pareceu ser
 * — a marca apoiada na pílula.
 *
 * As transições que ficaram são as de estado, não as de entrada: cor do ícone
 * ao passar o dedo e o `scale` do que está ativo. São as mesmas do resto do
 * produto, e tirá-las deixaria só esta barra sem resposta ao toque.
 *
 * ── Transparente, e o que sustenta a transparência ──────────────────────────
 *
 * A barra é translúcida: a página aparece por trás dela. O que **não**
 * sustenta isso é o `backdrop-filter`.
 *
 * O desfoque está declarado e o navegador reporta `blur(24px)` no estilo
 * computado, mas ele não borra o conteúdo da página atrás desta barra.
 * Testado subindo o raio até `blur(60px)`: o texto do cartão que passa por
 * trás continua perfeitamente legível. `backdrop-filter` em elemento `fixed`
 * é um ponto fraco conhecido, e aqui ele simplesmente não atua — nos mesmos
 * botões de vidro da capa de corrida, que não são fixos, ele funciona.
 *
 * A declaração fica: onde o navegador honrar, é lucro. Mas **o desenho não
 * pode depender dela**, e por isso quem carrega a legibilidade é a tinta.
 *
 * ── Por que 75%, e não menos ────────────────────────────────────────────────
 *
 * A 55% ficava bonito sobre o fundo da página e quebrava no pior caso: com o
 * cartão do Synse+ exatamente atrás, o texto dele atravessava a barra e se
 * embolava com os ícones — dava para ler "Programas, receitas, desafios e"
 * entre o halteres e o tênis. A 75% o mesmo caso vira um fantasma atrás dos
 * ícones, e nas rolagens normais, em que o fundo é a cor da página, a barra
 * continua visivelmente translúcida.
 *
 * ── E o custo por quadro ────────────────────────────────────────────────────
 *
 * `backdrop-filter` já saiu desta barra uma vez por custo: em elemento fixo
 * ele obriga o compositor a refazer a região borrada a cada quadro de
 * rolagem. Medido quando a barra abria e fechava: mediana de 16,7 ms nos dois
 * estados, p95 de 16,7 e 16,8, nenhum quadro acima de 32 ms. Agora o estado é
 * um só, e o que se media no pior caso é o único caso. Se um dia aparecer
 * engasgo num aparelho intermediário, o desfoque sai da pílula primeiro, que
 * é a que cresce com a largura da tela.
 */
export function AppBottomNavigation() {
  const pathname = usePathname()

  const esquerda = ITENS.filter((item) => item.lado === 'esquerda')
  const direita = ITENS.filter((item) => item.lado === 'direita')

  const renderizar = (item: (typeof ITENS)[number]) => {
    const ativo = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)
    const Icone = item.icon

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={ativo ? 'page' : undefined}
          className={cn(
            'flex flex-col items-center gap-1.5 px-2 py-3 transition-colors duration-200',
            ativo ? 'text-synse-primary' : 'text-synse-muted hover:text-synse-text',
          )}
        >
          <Icone
            className={cn('size-5 transition-transform duration-200', ativo && 'scale-110')}
            aria-hidden
          />
          <span className="sr-only">{item.label}</span>
          {/* O traço embaixo do ativo: a barra não tem rótulo para carregar isso. */}
          <span
            aria-hidden
            className={cn(
              'h-0.5 w-5 rounded-full transition-colors duration-200',
              ativo ? 'bg-synse-primary' : 'bg-transparent',
            )}
          />
        </Link>
      </li>
    )
  }

  return (
    /*
     * `pointer-events-none` no invólucro e `pointer-events-auto` na pílula: a
     * faixa de respiro embaixo e as sobras dos lados continuam deixando passar
     * o toque para a página, em vez de virarem uma borda morta na base da tela.
     */
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="relative mx-auto flex max-w-lg items-end justify-center px-4">
        <nav
          aria-label="Navegação do Synse App"
          className="vidro-led pointer-events-auto w-full rounded-full border border-synse-border bg-synse-surface/75 backdrop-blur-xl"
        >
          {/*
           * As duas metades têm de ter a **mesma largura**, e é por isso que
           * ambas são `flex-1`. Com três itens de um lado e dois do outro, um
           * layout que apenas enfileira empurra o vão do meio para a
           * esquerda, e o disco — que é centralizado na tela — acaba em cima
           * do ícone de corrida. Foi exatamente o que aconteceu.
           *
           * O preço é a assimetria de respiro: três ícones dividem metade da
           * barra e dois dividem a outra, então os da direita ficam mais
           * soltos. É o melhor arranjo possível com cinco destinos e um disco
           * no meio, e prefiro o respiro desigual a mexer na ordem das abas,
           * que é o que o polegar já decorou.
           */}
          <div className="flex w-full items-center px-2">
            <ul className="flex flex-1 items-center justify-evenly">{esquerda.map(renderizar)}</ul>

            {/* O buraco onde o disco se apoia. */}
            <span aria-hidden className="w-[72px] shrink-0" />

            <ul className="flex flex-1 items-center justify-evenly">{direita.map(renderizar)}</ul>
          </div>
        </nav>

        {/*
         * O disco fica fora da `nav` e depois dela no HTML: entre irmãos
         * posicionados sem `z-index`, quem vem por último pinta por cima.
         *
         * `aria-hidden` e `pointer-events-none`: é decoração. Quem usa leitor
         * de tela ouve cinco destinos e nada mais, e o toque que cair sobre o
         * disco atravessa para o que estiver atrás, em vez de morrer num
         * elemento sem ação.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
        >
          <span className="grid size-[60px] place-items-center rounded-full border border-synse-primary/40 bg-synse-surface/60 shadow-[0_0_20px_-4px_var(--synse-primary),inset_0_0_14px_-6px_var(--synse-cyan)] backdrop-blur-md">
            <Image src={BRAND.symbol} alt="" aria-hidden width={30} height={30} priority />
          </span>
        </div>
      </div>
    </div>
  )
}
