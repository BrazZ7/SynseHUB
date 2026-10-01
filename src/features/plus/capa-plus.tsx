import Image from 'next/image'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Badge } from '@/components/ui/badge'

/**
 * ── A capa do Synse+ ─────────────────────────────────────────────────────────
 *
 * Era um retângulo de degradê verde com uma bolha desfocada no canto. Honesto
 * e sem nenhuma profundidade: a página que vende a assinatura parecia a mais
 * crua do app.
 *
 * O desenho vem da mesma gramática da capa do perfil, que já resolveu isto
 * uma vez: arte sangrando até as bordas, véu por cima para o texto respirar,
 * e o conteúdo apoiado embaixo.
 *
 * ── A arte é a que já existe ────────────────────────────────────────────────
 *
 * `synse-capa-topo.webp`, a árvore acesa à noite. Não é economia de esforço:
 * é a imagem que a marca já usa no perfil, e repeti-la aqui faz as duas telas
 * pertencerem ao mesmo produto. Arte nova só para esta página criaria um
 * segundo Synse.
 *
 * ── Por que a `dark` fixa ───────────────────────────────────────────────────
 *
 * Mesma razão da capa do perfil: a arte é noite nos dois temas. Sem isto,
 * `text-synse-text` no tema claro seria quase preto sobre o escuro da imagem.
 * Marcando o bloco como `dark`, os tokens do tema escuro valem só aqui dentro
 * e todo componente continua legível sem precisar de variante nova.
 */
export function CapaPlus({
  voltar,
  selo,
  titulo,
  destaque,
  descricao,
}: {
  /*
   * O elo de voltar entra como slot, e não construído aqui dentro, pelo
   * mesmo motivo que `CapaPerfil` recebe a ação da tela: o guarda de
   * `tests/unit/back-link.test.ts` exige que a **página** renderize
   * `<BackLink>`. Ele é estrito de propósito — já passou uma vez com o
   * componente importado e removido da tela —, e esconder o elo uma camada
   * abaixo o cegaria para o caso que ele existe para pegar.
   */
  voltar: React.ReactNode
  selo: string
  /** A primeira linha, em branco. */
  titulo: string
  /** A segunda, em verde — o par de duas cores é a assinatura da marca. */
  destaque: string
  descricao: string
}) {
  return (
    /*
     * As margens negativas desfazem o `px-5` e o `pt-6` da casca do app, então
     * a arte encosta nas bordas da tela e começa no topo da rolagem.
     */
    <div className="relative -mx-5 -mt-6">
      <section className="dark relative overflow-hidden">
        <Image
          src="/synse-capa-topo.webp"
          alt=""
          aria-hidden
          width={912}
          height={584}
          /* Primeira coisa acima da dobra: carregada preguiçosamente, ela
             apareceria depois e daria um pulo na tela inteira. */
          priority
          sizes="(max-width: 512px) 100vw, 512px"
          className="absolute inset-0 size-full object-cover object-top"
        />

        {/*
         * Dois véus. O primeiro corre da esquerda para a direita, porque o
         * texto fica à esquerda e a árvore à direita — ele protege a leitura
         * sem apagar a arte. O segundo escurece o pé, onde o conteúdo se
         * apoia.
         */}
        <div
          aria-hidden
          className="from-synse-bg/95 absolute inset-0 bg-gradient-to-r via-synse-bg/55 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-synse-bg/70"
        />

        {/*
         * `pb-10` e não `pb-16`: a folga embaixo some dentro da costura, e
         * medindo na tela o que sobrava eram uns 150px de nada entre a
         * descrição e o primeiro cartão. As peças de referência são densas —
         * o vão fazia a página parecer inacabada, não arejada.
         */}
        <div className="relative flex min-h-[16rem] flex-col justify-end gap-3 px-5 pb-8 pt-6">
          {/*
           * Os dois à esquerda, empilhados. Alinhar o logotipo à direita o
           * punha em cima da copa da árvore: ilegível, e com duas coisas
           * claras brigando no mesmo canto.
           */}
          <div className="space-y-2">
            {voltar}
            <SynseLogo tone="light" size="sm" />
          </div>

          <div className="mt-auto space-y-3">
            <Badge className="bg-white/15 text-white backdrop-blur-[2px]">{selo}</Badge>

            {/*
             * Duas linhas, duas cores, `text-balance` para a quebra não
             * deixar uma palavra órfã. É o recorte que as peças de divulgação
             * usam, e ele só funciona com `leading-[1.05]`: no padrão, as
             * duas linhas afastam e viram dois títulos em vez de um.
             */}
            <h1 className="text-pretty text-[2rem] font-semibold leading-[1.05] tracking-tight text-white">
              {titulo}
              <br />
              <span className="text-synse-primary-light">{destaque}</span>
            </h1>

            <p className="max-w-[34ch] text-sm leading-relaxed text-white/70">{descricao}</p>
          </div>
        </div>
      </section>

      {/*
       * O degradê que costura a arte ao fundo da página fica **fora** do
       * `.dark`: dentro dele, `synse-bg` seria sempre o escuro, e no tema
       * claro a arte terminaria numa faixa preta em vez de derreter no branco.
       */}
      <div
        aria-hidden
        className="costura-com-a-pagina pointer-events-none absolute inset-x-0 bottom-0 h-20"
      />
    </div>
  )
}
