import {
  Award,
  CalendarDays,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Lock,
  Medal,
  Mountain,
  Trophy,
  Weight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { Conquista } from '@/features/students/achievements'
import type { DiaDaSemana, RecordePessoal } from '@/features/students/profile-service'
import type { NivelSynse } from '@/features/students/level'
import { cn } from '@/lib/utils'

/** As peças do perfil. Sem estado: tudo vem calculado do servidor. */

// ── A arte da marca ──────────────────────────────────────────────────────────
/**
 * A capa do perfil — e a identidade inteira por dentro dela.
 *
 * Era uma faixa no topo com o conteúdo abaixo, sobre a superfície do tema.
 * Depois virou um cartão com a arte de fundo. Agora não é mais cartão: sangra
 * até as bordas da tela, sem moldura nem cantos, e derrete no fundo da página
 * lá embaixo. Nome, nível, e-mail e Synse ID ficam por cima da arte.
 *
 * ── O logotipo saiu do arquivo ──────────────────────────────────────────────
 *
 * A arte trazia "SYNSE · SAÚDE • EQUILÍBRIO • EVOLUÇÃO" escrito dentro. Com o
 * nome da pessoa por cima, viravam dois títulos brigando. O texto foi apagado
 * no arquivo: as letras chegam a 216–255 de luminância e o céu em volta não
 * passa de 96, então um limiar em 110 separa os dois sem tocar na nuvem — o
 * buraco foi preenchido por difusão e recebeu de volta a textura de céu da
 * faixa logo acima.
 *
 * A tela também subiu, de 912×211 para 912×584, na proporção do cartão. A
 * arte fica no topo e o escuro desce por baixo dela: a árvore precisa ficar em
 * cima, e é sobre esse escuro que o nome se assenta. Sem
 * isso o `object-cover` teria que ampliar a arte quase três vezes para cobrir
 * a altura, e uma foto ampliada assim fica borrada num aparelho 3x.
 *
 * O arquivo mudou de nome junto com o conteúdo, e não por capricho: o
 * otimizador de imagem do Next guarda o resultado pela URL de origem. Trocar
 * os pixels mantendo o nome serviu a versão velha — com o logotipo — e eu só
 * percebi olhando a captura.
 *
 * ── Por que a `dark` fixa ───────────────────────────────────────────────────
 *
 * A arte é uma noite nos dois temas. No tema claro, `text-synse-text` seria
 * quase preto sobre ela, e os botões de foto sumiriam. Marcando o cartão como
 * `dark`, as variáveis do tema escuro valem só aqui dentro — e todo componente
 * que já usa os tokens continua legível, sem precisar de uma variante nova.
 */
export function CapaPerfil({
  children,
  acao,
}: {
  children: React.ReactNode
  acao?: React.ReactNode
}) {
  return (
    /*
     * ── Sem moldura ───────────────────────────────────────────────────────
     *
     * As margens negativas desfazem o `px-5` e o `pt-6` da casca do app, então
     * a arte encosta nas bordas da tela e começa no topo da rolagem. Era um
     * cartão com borda e cantos arredondados no meio da página; agora é a
     * primeira coisa que aparece ao abrir o perfil, sem nada delimitando.
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
          /* Ancorada em cima: a árvore e a montanha ficam no topo, e o que se
             perde quando o bloco cresce é o escuro de baixo. */
          className="absolute inset-0 size-full object-cover object-top"
        />

        {/*
         * O véu corre da esquerda para a direita porque o texto fica à
         * esquerda e a árvore à direita: assim ele protege a leitura sem
         * apagar a arte.
         */}
        <div
          aria-hidden
          className="from-synse-bg/88 absolute inset-0 bg-gradient-to-r via-synse-bg/45 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-transparent to-synse-bg/45"
        />

        {/* O botão ganha uma pastilha: solto sobre a copa da árvore ele some. */}
        {/*
         * O `z-10` não é enfeite: sem ele o botão de tema não recebia clique
         * nenhum.
         *
         * Este bloco e o do conteúdo, logo abaixo, são os dois posicionados e
         * ambos sem `z-index`. Entre irmãos posicionados quem vem depois no
         * HTML pinta por cima — e o conteúdo, que ocupa o cartão inteiro por
         * causa do `pt-14`, cobria o botão. Ele aparecia na tela, respondia ao
         * teclado, e o dedo batia no `div` de trás.
         */}
        {acao && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-synse-bg/55 backdrop-blur-[2px]">
            {acao}
          </div>
        )}

        {/*
         * O conteúdo se apoia embaixo e o `pb-16` guarda a faixa onde a arte
         * derrete no fundo da página — sem essa folga o nome cairia dentro do
         * degradê e desbotaria junto.
         */}
        <div className="relative flex min-h-[16rem] flex-col justify-end gap-4 px-5 pb-16 pt-14">
          {children}
        </div>
      </section>

      {/*
       * O degradê que costura a arte ao fundo da página fica **fora** do
       * `.dark`. Dentro dele, `synse-bg` seria sempre o escuro do tema escuro,
       * e no tema claro a arte terminaria numa faixa preta em vez de derreter
       * no branco da página.
       *
       * A rampa em si mora em `globals.css`, como `.costura-com-a-pagina`. Ela
       * era um degradê linear curto, que no tema escuro passava despercebido e
       * no claro virava uma tarja cinza atravessada na tela — dá para ver
       * comparando os dois temas lado a lado. Agora é uma rampa longa e com a
       * curva suavizada nas pontas, sem aresta em cima nem embaixo.
       */}
      <div
        aria-hidden
        className="costura-com-a-pagina pointer-events-none absolute inset-x-0 bottom-0 h-28"
      />
    </div>
  )
}

// ── Números do topo ──────────────────────────────────────────────────────────
/**
 * Os quatro números, numa linha só.
 *
 * Eram dois por linha, grandes, e ocupavam quase um terço da primeira tela do
 * perfil sem dizer mais por isso — quem abre o perfil quer bater o olho nos
 * quatro de uma vez, não rolar entre eles. Em quatro colunas cada quadro fica
 * com cerca de 80px numa tela de 390, então o conteúdo é centralizado e o
 * texto encolhe junto: ícone menor, número em `text-sm` e rótulo em 10px.
 *
 * `leading-tight` no rótulo porque "Medalhas" e "Desafios" cabem numa linha
 * nessa largura, mas um rótulo maior no futuro quebra em duas sem desalinhar
 * os quatro quadros.
 */
export function StatTile({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: LucideIcon
  valor: string
  rotulo: string
}) {
  return (
    <div className="vidro-led rounded-xl border border-synse-border bg-synse-surface px-2 py-3 text-center">
      <Icone className="mx-auto size-4 text-synse-primary" aria-hidden />
      <p className="mt-1.5 text-sm font-semibold tabular-nums text-synse-text">{valor}</p>
      <p className="text-[10px] leading-tight text-synse-muted">{rotulo}</p>
    </div>
  )
}

export const ICONES_DO_TOPO = { Dumbbell, Footprints, Trophy, Medal }

// ── Nível ────────────────────────────────────────────────────────────────────
/**
 * O nível é derivado do histórico, e a tela diz isso.
 *
 * Sem a frase, o número parece um saldo que alguém guardou — e a primeira
 * pergunta vira "por que meu XP mudou?". Dizer de onde ele vem transforma a
 * dúvida em algo que a pessoa consegue conferir sozinha.
 */
export function NivelCard({ nivel }: { nivel: NivelSynse }) {
  return (
    <section className="vidro-led rounded-2xl border border-synse-border bg-synse-surface p-5">
      <h2 className="text-sm font-semibold text-synse-text">Seu nível Synse</h2>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold text-synse-text">Nível {nivel.nivel}</p>
        <p className="text-sm tabular-nums text-synse-muted">
          {nivel.xpNoNivel.toLocaleString('pt-BR')} / {nivel.xpDoNivel.toLocaleString('pt-BR')} XP
        </p>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-synse-bg"
        role="progressbar"
        aria-valuenow={Math.round(nivel.progresso * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso do nível ${nivel.nivel}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-synse-primary to-synse-primary-light"
          style={{ width: `${Math.round(nivel.progresso * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-synse-muted">
        Faltam {nivel.falta.toLocaleString('pt-BR')} XP para o próximo nível.
      </p>
      <p className="mt-1 text-[11px] text-synse-muted">
        Seu XP vem do que você fez: treinos, quilômetros e medalhas.
      </p>
    </section>
  )
}

// ── Conquistas ───────────────────────────────────────────────────────────────
const ICONE_DA_CONQUISTA: Record<Conquista['icone'], LucideIcon> = {
  treino: Dumbbell,
  corrida: Footprints,
  chama: Flame,
  montanha: Mountain,
  trofeu: Trophy,
  peso: Weight,
}

export function ConquistaHex({ conquista }: { conquista: Conquista }) {
  const Icone = conquista.conquistada ? ICONE_DA_CONQUISTA[conquista.icone] : Lock

  return (
    <li className="flex w-20 shrink-0 flex-col items-center gap-2 text-center">
      <span
        title={conquista.conquistada ? conquista.descricao : (conquista.progresso ?? '')}
        className={cn(
          'grid size-16 place-items-center rounded-2xl border',
          conquista.conquistada
            ? 'border-synse-primary/40 bg-synse-primary/10 text-synse-primary shadow-[0_0_18px_-6px_var(--synse-primary)]'
            : // Tracejada e sem cor: a que falta precisa parecer o que é.
              'border-dashed border-synse-border bg-synse-bg text-synse-muted',
        )}
      >
        <Icone className="size-7" aria-hidden />
      </span>
      <span className="text-[11px] leading-tight text-synse-muted">
        {conquista.conquistada ? conquista.nome : (conquista.progresso ?? 'Em breve')}
      </span>
    </li>
  )
}

// ── Evolução ─────────────────────────────────────────────────────────────────
/**
 * Sete colunas sempre, inclusive as vazias.
 *
 * Mesma razão do gráfico do SynseRun: um gráfico que só desenha os dias
 * treinados esconde exatamente o que a pessoa foi procurar ali — em quais dias
 * ela não aparece.
 */
export function SemanaChart({ dias }: { dias: DiaDaSemana[] }) {
  const maior = Math.max(1, ...dias.map((d) => d.treinos))

  return (
    <div className="flex h-36 items-end justify-between gap-1.5">
      {dias.map((dia) => (
        <div key={dia.rotulo} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div
            className="w-full rounded-t bg-gradient-to-t from-synse-primary/50 to-synse-primary"
            style={{ height: `${Math.max(4, (dia.treinos / maior) * 100)}%` }}
            title={`${dia.rotulo}: ${dia.treinos} ${dia.treinos === 1 ? 'treino' : 'treinos'}`}
          />
          <span className="text-[10px] text-synse-muted">{dia.rotulo}</span>
        </div>
      ))}
    </div>
  )
}

export function RecordeRow({ recorde }: { recorde: RecordePessoal }) {
  const Icone = ICONE_DO_RECORDE[recorde.rotulo] ?? Award

  return (
    <li className="flex items-center gap-3 rounded-lg border border-synse-border bg-synse-bg px-3 py-2.5">
      <Icone className="size-4 shrink-0 text-synse-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs text-synse-muted">{recorde.rotulo}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-text">
        {recorde.valor}
      </span>
    </li>
  )
}

const ICONE_DO_RECORDE: Record<string, LucideIcon> = {
  'Maior distância': Footprints,
  'Melhor pace': Gauge,
  'Maior carga': Weight,
  'Maior sequência': CalendarDays,
}
