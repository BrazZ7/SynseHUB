'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Dumbbell, Footprints, Home, TrendingUp, UserRound } from 'lucide-react'

import { BRAND } from '@/config/app'
import { cn } from '@/lib/utils'

/*
 * Cinco destinos, e o do meio é a ação.
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

/*
 * ── As gotas ────────────────────────────────────────────────────────────────
 *
 * Ângulos fixos, e não sorteados: `Math.random` no servidor e no navegador dão
 * valores diferentes, e o React reclamaria da hidratação a cada carregamento.
 *
 * A distribuição é de propósito desigual. As gotas que sobem viajam menos que
 * as que saem para os lados e para baixo — um respingo simétrico pareceria uma
 * explosão, e o que se quer é a água sendo atirada para fora pela beirada do
 * disco, caindo mais do que subindo.
 */
const GOTAS = [
  { a: '-72deg', d: '26px', atraso: '0ms', tamanho: 7 },
  { a: '-38deg', d: '34px', atraso: '30ms', tamanho: 6 },
  { a: '-8deg', d: '22px', atraso: '70ms', tamanho: 5 },
  { a: '22deg', d: '32px', atraso: '20ms', tamanho: 6 },
  { a: '58deg', d: '28px', atraso: '55ms', tamanho: 7 },
  { a: '96deg', d: '40px', atraso: '0ms', tamanho: 8 },
  { a: '128deg', d: '46px', atraso: '40ms', tamanho: 7 },
  { a: '162deg', d: '38px', atraso: '85ms', tamanho: 6 },
  { a: '196deg', d: '44px', atraso: '15ms', tamanho: 8 },
  { a: '232deg', d: '36px', atraso: '60ms', tamanho: 6 },
  { a: '268deg', d: '30px', atraso: '35ms', tamanho: 7 },
  { a: '304deg', d: '24px', atraso: '75ms', tamanho: 5 },
] as const

/** Meia volta e meia por toque: para no mesmo lugar, mas passa girando. */
const GIRO_POR_TOQUE = 540

/**
 * Navegação principal do Synse App.
 *
 * ── Recolhida por padrão ────────────────────────────────────────────────────
 *
 * Em repouso só o disco da marca aparece; tocar nele abre a barra. É uma
 * escolha de quem manda no produto, e vale registrar o custo: chegar a
 * qualquer aba passa a ser dois toques em vez de um. Em troca, a tela fica
 * livre e o disco vira o gesto da marca.
 *
 * ── O giro e o respingo ─────────────────────────────────────────────────────
 *
 * O disco acumula 540° a cada toque, numa transição — não numa animação. Com
 * `animation` seria preciso remontar o elemento para reiniciar o quadro, e o
 * giro voltaria ao zero entre um toque e outro; somando num estado, cada toque
 * continua de onde o anterior parou e a rotação nunca "pula".
 *
 * As gotas, ao contrário, são `animation` e **precisam** remontar: cada toque
 * é um respingo novo. Por isso a chave do contêiner é o contador de toques.
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
 * rolagem. Medido agora, rolando a tela inicial por 120 quadros: mediana de
 * 16,7 ms com a barra fechada e 16,7 ms com ela aberta, p95 de 16,7 e 16,8,
 * nenhum quadro acima de 32 ms. A medida saiu de um Chromium num contêiner e
 * não de um telefone intermediário, que é onde desfoque costuma doer — se um
 * dia aparecer engasgo, ele sai da pílula primeiro, que é a que cresce com a
 * largura do aparelho.
 */
export function AppBottomNavigation() {
  const pathname = usePathname()
  const [aberta, setAberta] = useState(false)
  const [toques, setToques] = useState(0)
  const primeiroItem = useRef<HTMLAnchorElement>(null)

  const alternar = useCallback(() => {
    setAberta((estava) => !estava)
    setToques((quantos) => quantos + 1)
  }, [])

  /*
   * Navegou, recolhe — sem girar. O giro é resposta ao toque no disco; girar
   * sozinho depois de a página trocar pareceria defeito.
   *
   * O efeito depende só do caminho, e não de `aberta`, senão ele fecharia a
   * barra no mesmo instante em que ela abre.
   */
  useEffect(() => {
    setAberta(false)
  }, [pathname])

  /* Esc fecha, como qualquer coisa que abre por cima do conteúdo. */
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberta(false)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberta])

  /* Abriu pelo teclado, o foco vai para o primeiro destino. */
  useEffect(() => {
    if (aberta && toques > 0) primeiroItem.current?.focus()
  }, [aberta, toques])

  const esquerda = ITENS.filter((item) => item.lado === 'esquerda')
  const direita = ITENS.filter((item) => item.lado === 'direita')

  const renderizar = (item: (typeof ITENS)[number], indice: number, primeiro: boolean) => {
    const ativo = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)
    const Icone = item.icon

    return (
      <li key={item.href}>
        <Link
          ref={primeiro ? primeiroItem : undefined}
          href={item.href}
          aria-current={ativo ? 'page' : undefined}
          className={cn(
            'flex flex-col items-center gap-1.5 px-2 py-3 transition-colors duration-200',
            ativo ? 'text-synse-primary' : 'text-synse-muted hover:text-synse-text',
          )}
          /*
           * Cada ícone sai de trás do disco com um atraso próprio, para a
           * barra abrir em leque em vez de aparecer inteira de uma vez.
           */
          style={{ transitionDelay: aberta ? `${90 + indice * 45}ms` : '0ms' }}
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="relative mx-auto flex max-w-lg items-end justify-center px-4">
        {/*
         * ── A pílula ────────────────────────────────────────────────────────
         *
         * Ela abre por `clip-path`, do centro para fora, e não por largura: o
         * navegador anima recorte no compositor, enquanto animar largura
         * refaz o layout a cada quadro — com a barra fixa em cima de uma
         * página que rola, isso se paga caro.
         *
         * Recortar também evita o que um `scaleX` faria: esticar os ícones.
         */}
        <nav
          aria-label="Navegação do Synse App"
          id="barra-synse"
          inert={!aberta}
          className={cn(
            'vidro-led w-full rounded-full border border-synse-border bg-synse-surface/75 transition-[clip-path,opacity] duration-500 ease-out',
            aberta
              ? 'pointer-events-auto opacity-100 backdrop-blur-xl [clip-path:inset(0_0_0_0_round_9999px)]'
              : 'opacity-0 [clip-path:inset(0_50%_0_50%_round_9999px)]',
          )}
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
            <ul className="flex flex-1 items-center justify-evenly">
              {esquerda.map((item, indice) =>
                renderizar(item, esquerda.length - indice, indice === 0),
              )}
            </ul>

            {/* O buraco onde o disco se apoia. */}
            <span aria-hidden className="w-[72px] shrink-0" />

            <ul className="flex flex-1 items-center justify-evenly">
              {direita.map((item, indice) => renderizar(item, indice + 1, false))}
            </ul>
          </div>
        </nav>

        {/*
         * O disco fica fora da `nav` e depois dela no HTML: entre irmãos
         * posicionados sem `z-index`, quem vem por último pinta por cima — e
         * ele precisa continuar clicável com a barra fechada.
         */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <div className="relative">
            {/* As gotas. A chave é o contador: cada toque remonta e reinicia. */}
            <div key={toques} aria-hidden className="pointer-events-none absolute inset-0">
              {toques > 0 &&
                GOTAS.map((gota, indice) => (
                  <span
                    key={indice}
                    /*
                     * `animate-respingo`, e não o nome da animação no
                     * `style`: o Tailwind só emite o `@keyframes` quando vê a
                     * utilitária correspondente no código. Com o nome apenas
                     * em linha, o quadro era podado na compilação — as gotas
                     * existiam no HTML, tinham `animation-name`, e não se
                     * mexiam, porque a animação que elas pediam não existia.
                     *
                     * O atraso continua em linha, um por gota: estilo em
                     * linha ganha do atalho `animation` da classe, e sem isso
                     * as doze sairiam no mesmo instante, em bloco.
                     */
                    className="absolute left-1/2 top-1/2 animate-respingo rounded-full bg-gradient-to-b from-white to-synse-cyan shadow-[0_0_10px_-1px_var(--synse-cyan)] motion-reduce:hidden"
                    style={{
                      width: `${gota.tamanho}px`,
                      height: `${gota.tamanho}px`,
                      marginLeft: `-${gota.tamanho / 2}px`,
                      marginTop: `-${gota.tamanho / 2}px`,
                      animationDelay: gota.atraso,
                      ['--a' as string]: gota.a,
                      ['--d' as string]: gota.d,
                      ['--r' as string]: '30px',
                    }}
                  />
                ))}
            </div>

            <button
              type="button"
              onClick={alternar}
              aria-expanded={aberta}
              aria-controls="barra-synse"
              aria-label={aberta ? 'Fechar a navegação' : 'Abrir a navegação'}
              className="pointer-events-auto grid size-[60px] place-items-center rounded-full border border-synse-primary/40 bg-synse-surface/60 shadow-[0_0_20px_-4px_var(--synse-primary),inset_0_0_14px_-6px_var(--synse-cyan)] backdrop-blur-md transition-shadow duration-300 hover:shadow-[0_0_28px_-2px_var(--synse-primary),inset_0_0_14px_-4px_var(--synse-cyan)]"
            >
              <Image
                src={BRAND.symbol}
                alt=""
                aria-hidden
                width={30}
                height={30}
                priority
                /*
                 * Giro acumulado numa transição, e não numa animação: somando
                 * no estado, cada toque continua de onde o anterior parou.
                 * Com `animation` seria preciso remontar para reiniciar, e a
                 * rotação voltaria ao zero entre um toque e outro.
                 */
                className="transition-transform [transition-duration:900ms] [transition-timing-function:cubic-bezier(0.16,0.9,0.22,1)] motion-reduce:transition-none"
                style={{ transform: `rotate(${toques * GIRO_POR_TOQUE}deg)` }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
