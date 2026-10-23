import { estiloDoFio, FIOS, MINT } from '@/features/nutrition/components/fios-da-cachoeira'
import { cn } from '@/lib/utils'

/**
 * ── A cachoeira ─────────────────────────────────────────────────────────────
 *
 * O fundo do quadro das refeições. É a mesma linguagem do vale do SynseRun —
 * verde-azulado, noite, luz que vem de dentro — e aqui ela carrega uma ideia
 * que a pilha de cartões não carregava: o dia **desce**. A água nasce no alto,
 * passa por um degrau em cada horário, e a bruma embaixo é o fim do dia.
 *
 * ── Por que a água fica na calha, e não atrás do texto ──────────────────────
 *
 * Arte em movimento atrás de parágrafo é ilegível, e nenhuma quantidade de véu
 * conserta — o contraste muda quadro a quadro, então ora passa, ora não. A
 * cachoeira ocupa a coluna estreita onde moram os horários; as sugestões e as
 * trocas ficam sobre o degradê parado, à direita dela.
 *
 * ── O que sobra sem movimento ───────────────────────────────────────────────
 *
 * O leito — a linha vertical parada — é desenhado sempre. Com
 * `prefers-reduced-motion` os fios desaparecem e a calha continua lendo como
 * uma calha, ligando um horário ao próximo. Não é degradação, é o mesmo
 * desenho sem a animação.
 */

export function Cachoeira({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none overflow-hidden', className)}>
      {/*
       * A nascente. Sem ela a água começa no nada, e água que começa no nada
       * lê como falha de desenho em vez de queda vindo de cima.
       */}
      <div
        className="absolute inset-x-0 top-0 h-28"
        style={{
          backgroundImage: `radial-gradient(70% 100% at 50% 0%, rgba(${MINT},0.38), rgba(${MINT},0) 72%)`,
        }}
      />

      {/* O leito: o que sobra parado, e o que liga um horário ao próximo. */}
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-synse-mint/30 to-transparent" />

      {FIOS.map((fio) => (
        <span
          key={fio.x}
          /*
           * A volta desloca exatamente um ladrilho, e o degradê se repete
           * nesse mesmo passo: o fim do ciclo é pixel a pixel igual ao começo,
           * e não há emenda para disfarçar. Os dois números saem da mesma
           * função — ver `estiloDoFio`.
           */
          className="absolute animate-queda rounded-full motion-reduce:hidden"
          style={estiloDoFio(fio)}
        />
      ))}

      {/*
       * A bruma, onde a água bate. O respiro é bem mais lento que a queda — no
       * mesmo tempo leria como piscada — e `origin-bottom` mantém o pé colado
       * no fundo enquanto ela abre para os lados.
       */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 origin-bottom animate-bruma motion-reduce:animate-none"
        style={{
          backgroundImage: `radial-gradient(80% 100% at 50% 100%, rgba(${MINT},0.45), rgba(${MINT},0) 70%)`,
        }}
      />
    </div>
  )
}
