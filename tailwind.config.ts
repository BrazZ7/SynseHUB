import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

/**
 * Tailwind é ligado aos design tokens do Synse declarados em `globals.css`.
 * Toda cor referencia uma CSS variable — o dark mode troca apenas as variáveis,
 * nunca as classes usadas nos componentes.
 */

/**
 * A cor de um token, com opacidade.
 *
 * ── O defeito que isto conserta ─────────────────────────────────────────────
 *
 * Antes cada cor era a string `'var(--synse-primary)'`. O Tailwind 3 sabe ler
 * um hex e recompor com alfa, mas não sabe olhar dentro de uma CSS variable —
 * então, diante de `bg-synse-primary/10`, ele não gerava regra nenhuma. A
 * classe ficava no HTML, o CSS não existia, e o navegador não pintava nada.
 *
 * Falhava em silêncio, que é o pior jeito de falhar: 133 usos espalhados pelo
 * app — os avisos amarelos, as caixas de erro, os selos, o anel de foco, o véu
 * escuro por cima das fotos — todos escritos para ter um fundo suave e todos
 * renderizando transparente. O fundo do avatar sem foto era o mais visível:
 * `bg-synse-mint/60` sumia e sobravam as iniciais escuras sobre a superfície
 * escura, ilegíveis no tema escuro.
 *
 * ── Por que `color-mix` e não variáveis em canais ───────────────────────────
 *
 * A receita usual é guardar `--synse-primary: 23 196 165` e escrever
 * `rgb(var(--synse-primary) / <alpha-value>)`. Funciona, mas quebraria todo
 * `var(--synse-primary)` usado fora do Tailwind — os valores arbitrários de
 * sombra e brilho, e o CSS escrito à mão em `globals.css`. Aqui só o mapa de
 * cores muda; `globals.css` continua com os mesmos hexadecimais.
 *
 * `color-mix` é suportado desde o Chrome 111 e o Safari 16.2. Onde não houver,
 * a classe simplesmente não pinta — exatamente o que acontecia antes.
 */
function token(nome: string) {
  const cor = ({ opacityValue }: { opacityValue?: string } = {}) =>
    opacityValue === undefined || opacityValue === '1'
      ? `var(--synse-${nome})`
      : `color-mix(in srgb, var(--synse-${nome}) calc(${opacityValue} * 100%), transparent)`

  /*
   * O Tailwind aceita uma função no lugar da cor — é assim que ele passa a
   * opacidade da classe. Os tipos publicados na versão 3 não descrevem esse
   * formato, só `string`, então a conversão é aqui, num lugar só, em vez de um
   * `@ts-expect-error` em cada linha do mapa de cores.
   */
  return cor as unknown as string
}
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        synse: {
          bg: token('bg'),
          surface: token('surface'),
          'surface-2': token('surface-2'),
          dark: token('dark'),
          'dark-2': token('dark-2'),
          primary: token('primary'),
          'primary-light': token('primary-light'),
          cyan: token('cyan'),
          mint: token('mint'),
          text: token('text'),
          muted: token('muted'),
          border: token('border'),
          success: token('success'),
          warning: token('warning'),
          danger: token('danger'),
        },
        border: token('border'),
        input: token('border'),
        ring: token('primary'),
        background: token('bg'),
        foreground: token('text'),
        primary: {
          DEFAULT: token('primary'),
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: token('surface-2'),
          foreground: token('text'),
        },
        muted: {
          DEFAULT: token('surface-2'),
          foreground: token('muted'),
        },
        accent: {
          DEFAULT: token('mint'),
          foreground: token('dark'),
        },
        destructive: {
          DEFAULT: token('danger'),
          foreground: '#FFFFFF',
        },
        card: {
          DEFAULT: token('surface'),
          foreground: token('text'),
        },
        popover: {
          DEFAULT: token('surface'),
          foreground: token('text'),
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Hierarquia tipográfica Synse
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'page-title': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        subtitle: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        'synse-sm': '0 1px 2px rgba(6, 46, 42, 0.05)',
        synse: '0 2px 10px -2px rgba(6, 46, 42, 0.08), 0 1px 3px rgba(6, 46, 42, 0.04)',
        'synse-lg': '0 18px 45px -18px rgba(6, 46, 42, 0.28)',
        glow: '0 10px 40px -12px rgba(0, 169, 143, 0.45)',
      },
      backgroundImage: {
        'synse-gradient': 'linear-gradient(135deg, #00A98F 0%, #22C7D8 100%)',
        'synse-gradient-deep': 'linear-gradient(150deg, #062E2A 0%, #083D38 55%, #0C4A42 100%)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        /*
         * As fagulhas da muda do perfil. Só `transform` e `opacity`: as duas
         * são compostas na GPU, então elas não obrigam o navegador a refazer
         * layout nem pintura enquanto a página rola.
         */
        faisca: {
          '0%': { transform: 'translateY(6px) scale(0.6)', opacity: '0' },
          '20%': { opacity: '0.85' },
          '100%': { transform: 'translateY(-26px) scale(1)', opacity: '0' },
        },
        /*
         * ── A nutação ───────────────────────────────────────────────────────
         *
         * Não é vento. Planta parada, num time-lapse, não balança: ela
         * **circula**. A ponta do broto descreve uma elipse lenta enquanto
         * cresce — chama-se circunutação, e é o movimento que aparece nos
         * vídeos de feijão que o dono do produto mandou como referência.
         *
         * Um balanço para os lados é o que todo mundo faz, e foi o que ele
         * chamou de genérico. Circular é o que planta faz.
         *
         * ── Como se desenha uma elipse em CSS ───────────────────────────────
         *
         * Com as duas componentes defasadas em um quarto de ciclo: o
         * `skewX` corre como seno e o `scaleY` como cosseno. Quando a planta
         * está no extremo lateral ela tem altura média; quando está no meio,
         * está no ponto mais alto ou mais baixo. A ponta, então, não vai e
         * volta pela mesma linha — ela contorna.
         *
         * `skewX`, e não `rotate`: girar move base e ponta pelo mesmo ângulo,
         * e a base está enterrada. O cisalhamento desloca cada ponto em
         * proporção à altura, que é como uma haste flexível se comporta. O
         * `rotate` fica pequeno, só para o talo não parecer rígido dentro do
         * cisalhamento.
         */
        nutacao: {
          '0%': { transform: 'skewX(0deg) rotate(0deg) scaleY(1.013)' },
          '12%': {
            transform:
              'skewX(calc(var(--vida, 1) * -3.2deg)) rotate(calc(var(--vida, 1) * 0.5deg)) scaleY(1.011)',
          },
          '25%': {
            transform:
              'skewX(calc(var(--vida, 1) * -5.8deg)) rotate(calc(var(--vida, 1) * 0.95deg)) scaleY(1)',
          },
          '38%': {
            transform:
              'skewX(calc(var(--vida, 1) * -4.4deg)) rotate(calc(var(--vida, 1) * 0.7deg)) scaleY(0.99)',
          },
          '50%': { transform: 'skewX(0deg) rotate(0deg) scaleY(0.987)' },
          '62%': {
            transform:
              'skewX(calc(var(--vida, 1) * 3.6deg)) rotate(calc(var(--vida, 1) * -0.55deg)) scaleY(0.99)',
          },
          '75%': {
            transform:
              'skewX(calc(var(--vida, 1) * 5.4deg)) rotate(calc(var(--vida, 1) * -0.9deg)) scaleY(1)',
          },
          '88%': {
            transform:
              'skewX(calc(var(--vida, 1) * 2.8deg)) rotate(calc(var(--vida, 1) * -0.45deg)) scaleY(1.011)',
          },
          '100%': { transform: 'skewX(0deg) rotate(0deg) scaleY(1.013)' },
        },
        /*
         * A deriva: a mesma elipse, menor, num ciclo que não divide o da
         * nutação. Onze segundos contra sete e meio só voltam a coincidir
         * depois de mais de um minuto — na prática, nunca. Planta de verdade
         * também não fecha duas voltas iguais, e é isso que tira do laço a
         * cara de laço.
         */
        deriva: {
          '0%, 100%': { transform: 'skewX(0.8deg) scaleY(0.997)' },
          '30%': { transform: 'skewX(calc(var(--vida, 1) * -1.4deg)) scaleY(1.004)' },
          '55%': { transform: 'skewX(calc(var(--vida, 1) * 1.2deg)) scaleY(1.002)' },
          '78%': { transform: 'skewX(calc(var(--vida, 1) * -0.5deg)) scaleY(0.996)' },
        },
        /*
         * As folhas e gotas paradas no ar, no painel do jardim. Bóiam de leve,
         * num ciclo mais longo que o do caule: em fase com ele, voltariam a
         * parecer presas na planta em vez de suspensas ao lado dela.
         */
        boiar: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(-0.6deg)' },
          '34%': {
            transform:
              'translate3d(calc(var(--boia, 1) * 5px), calc(var(--boia, 1) * -6px), 0) rotate(1deg)',
          },
          '67%': {
            transform:
              'translate3d(calc(var(--boia, 1) * -4px), calc(var(--boia, 1) * -2px), 0) rotate(0.2deg)',
          },
        },
        /*
         * A folha que o vento leva. Sobe e vai para a direita girando, some no
         * escuro. Só `transform` e `opacity`, que a GPU compõe sem refazer
         * layout nem pintura enquanto a página rola.
         */
        voar: {
          '0%': { opacity: '0', transform: 'translate3d(0, 0, 0) rotate(0deg) scale(0.85)' },
          '12%': { opacity: '0.95' },
          '72%': { opacity: '0.8' },
          '100%': {
            opacity: '0',
            transform:
              'translate3d(var(--vx, 200px), var(--vy, -90px), 0) rotate(var(--vg, 200deg)) scale(1.05)',
          },
        },
      },
      animation: {
        /*
         * 160ms, e não 260ms.
         *
         * A animação roda a cada navegação, e `both` mantém o conteúdo
         * invisível até ela começar. Com o esqueleto de carregamento agora no
         * lugar, eram duas esperas em série — o esqueleto e depois a entrada.
         * O tempo mais curto ainda dá a sensação de movimento sem adiar o
         * conteúdo. Quem pediu menos movimento não vê nenhuma: `globals.css`
         * zera tudo em `prefers-reduced-motion`.
         */
        'fade-in-up': 'fade-in-up 160ms ease-out both',
        'fade-in': 'fade-in 200ms ease-out both',
        'accordion-down': 'accordion-down 200ms ease-out',
        'accordion-up': 'accordion-up 200ms ease-out',
        /* A duração real vem de cada fagulha, para elas não subirem em bloco. */
        faisca: 'faisca 5s ease-out infinite',
        /* Linear: a volta é contínua, e `ease` faria a planta parar nas pontas. */
        nutacao: 'nutacao 11s linear infinite',
        deriva: 'deriva 7.5s ease-in-out infinite',
        boiar: 'boiar 11s ease-in-out infinite',
        /* A duração real vem de cada folha, para elas não cruzarem juntas. */
        voar: 'voar 12s linear infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
