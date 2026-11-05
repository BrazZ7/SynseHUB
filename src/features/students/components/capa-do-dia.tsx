import Image from 'next/image'

/**
 * ── A arte do cartão "Seu dia" ───────────────────────────────────────────────
 *
 * O cartão do treino de hoje era degradê verde com uma bolha desfocada no
 * canto. É a primeira coisa que o aluno vê ao abrir o app, e era também a mais
 * crua da tela. Agora tem a foto dos halteres por trás — a mesma gramática das
 * capas do perfil e do Synse+: arte sangrando até as bordas, véu por cima para
 * o texto respirar, conteúdo apoiado em cima.
 *
 * ── Por que a foto não é só um `background-image` ────────────────────────────
 *
 * Passa pelo `next/image` para o navegador receber o tamanho que a tela pede,
 * em AVIF quando ele aceita. Em `background-image` o arquivo vai inteiro para
 * todo mundo, e numa rede de academia isso é megabyte de diferença no cartão
 * mais visto do produto.
 *
 * ── Os dois movimentos, e por que são dois ───────────────────────────────────
 *
 * `aproximar` é a foto respirando: 18s de ida, 18s de volta, deslocamento de
 * 1,5%. Sozinho ele dá profundidade e nada mais — é lento de propósito, porque
 * o cartão fica embaixo de texto que a pessoa está lendo.
 *
 * `facho` é o feixe de luz da foto atravessando o cartão, uma vez a cada 11s.
 * Ele existe para o cartão ter um instante de vida e voltar a ficar quieto; a
 * pausa longa entre as passagens é o que o separa de um esqueleto de
 * carregamento, e está explicada no quadro dele no `tailwind.config.ts`.
 *
 * ── Quem pediu menos movimento ───────────────────────────────────────────────
 *
 * O `globals.css` já zera a duração de toda animação em
 * `prefers-reduced-motion`, mas zerar não basta nos dois casos: a foto ficaria
 * presa no primeiro quadro (que é um estado válido, então tudo bem) e o facho
 * **piscaria uma vez** no lugar de atravessar — um lampejo sem explicação.
 * Por isso o facho é `motion-reduce:hidden` e a foto é `motion-safe:`, como já
 * fazem a poeira da trilha e as folhas do SynseRun.
 */
export function CapaDoDia() {
  return (
    /*
     * `pointer-events-none`: nada aqui pode interceptar o toque no "Ver
     * treino", que fica exatamente por cima da parte mais escura.
     */
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Image
        src="/synse-halteres.webp"
        alt=""
        width={1280}
        height={720}
        /*
         * Acima da dobra: sem `priority` ela chega depois da primeira pintura
         * e o cartão pisca de verde chapado para foto, bem embaixo do olho de
         * quem acabou de abrir o app.
         */
        priority
        /*
         * A casca do app é `max-w-lg` / `md:max-w-2xl` / `lg:max-w-5xl` com
         * `px-5`, e este cartão ocupa a largura inteira. São esses três números
         * menos os 40px das laterais.
         */
        sizes="(min-width: 1024px) 984px, (min-width: 768px) 632px, 100vw"
        /*
         * A escala de base é a mesma do primeiro quadro de `aproximar`. Sem
         * ela, quem pediu menos movimento veria a foto em escala exata — e o
         * `object-cover` de um 16:9 num cartão bem mais largo que alto já corta
         * o topo e o pé, então a sobra também é o que protege contra a borda
         * aparecer.
         */
        className="absolute inset-0 size-full scale-[1.06] object-cover object-center motion-safe:animate-aproximar"
      />

      {/*
       * O facho, **antes** dos véus.
       *
       * A primeira versão acendia aos 22% do ciclo, com a faixa sobre 61% da
       * largura — em cima do fim da linha "Divisão X · N exercícios". O que
       * resolveu isso foi mover o pico para 26%, onde a faixa já está em 77% e
       * só pega foto; medido depois, com o pico no lugar certo, pôr o facho
       * acima ou abaixo dos véus dá o mesmo contraste (5,77:1 atrás dos
       * glifos, nos dois casos).
       *
       * Então a ordem não é o conserto — é a garantia. Embaixo do véu, mexer
       * no tempo outra hora não consegue pôr faixa clara sobre o texto: onde o
       * véu é opaco ele abafa, onde é transparente ele deixa passar. Sem
       * recorte e sem máscara.
       *
       * Mais alto que o cartão e deslocado para cima porque é inclinado: no
       * tamanho exato, o `skewX` deixaria um canto vazio em cima e outro
       * embaixo durante a travessia.
       */}
      <div className="absolute left-0 top-[-30%] h-[160%] w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 motion-safe:animate-facho motion-reduce:hidden" />

      {/*
       * O véu de leitura, da esquerda para a direita: o texto fica à esquerda e
       * os halteres à direita, então ele protege a leitura sem apagar a foto.
       *
       * **A parada em 62% é medida, e precisa dos colchetes.** A coluna de
       * texto vai até uns 58% da largura, e no padrão do Tailwind o meio do
       * degradê cai em 50% — cedo demais, com a foto clareando o fim das
       * linhas. `via-[62%]` e não `via-62%`: a escala de posições do Tailwind
       * anda de cinco em cinco, então `via-62%` **não gera CSS nenhum** e a
       * classe fica no HTML sem fazer nada. Foi o que aconteceu na primeira
       * tentativa, e só apareceu lendo `--tw-gradient-via-position` no
       * navegador.
       *
       * Com ela valendo, e no instante mais claro do facho, o contraste atrás
       * dos glifos é 4,74:1 no "SEU DIA", 5,77:1 na linha da divisão e 9,99:1
       * no título — todos acima do mínimo da WCAG. O cartão antes da arte
       * media 4,54, 5,24 e 10,87.
       *
       * `synse-dark` e não um hex solto. No tema claro o token é `#062e2a`, que
       * é exatamente onde o `bg-synse-gradient-deep` do cartão começa — a ponta
       * esquerda continua idêntica ao que o cartão sempre foi. No tema escuro
       * ele é mais fundo, e aí o texto branco ganha contraste em vez de perder.
       */}
      <div className="absolute inset-0 bg-gradient-to-r from-synse-dark via-synse-dark/90 via-[62%] to-synse-dark/5" />

      {/*
       * O véu do pé. O botão "Ver treino" é `bg-white/15` — sobre o chão
       * texturizado da foto ele perderia a borda e viraria uma mancha.
       */}
      <div className="absolute inset-0 bg-gradient-to-t from-synse-dark/70 via-transparent to-transparent" />
    </div>
  )
}
