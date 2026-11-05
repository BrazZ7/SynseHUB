import type { MuscleGroup } from '@/types/domain'

/**
 * ── O mapa muscular ─────────────────────────────────────────────────────────
 *
 * Duas silhuetas, frente e costas, com aceso o que o treino trabalha.
 *
 * É arte que **informa**: quem abre esta tela vem escolher o treino de hoje, e
 * a pergunta é "qual é o de braço". Ler isso num desenho é mais rápido que ler
 * três nomes de exercício — e continua valendo para quem não conhece os nomes.
 *
 * ── Por que frente **e** costas ─────────────────────────────────────────────
 *
 * Só a frente não serve: costas e glúteos não aparecem nela, e seriam
 * justamente os dois grupos que ficariam sem resposta — o treino de costas
 * mostraria um boneco apagado. Duas figuras pequenas resolvem sem truque.
 *
 * ── Por que vetor desenhado aqui, e não imagem ──────────────────────────────
 *
 * O vale do SynseRun é um `.webp`, e para uma capa só isso é certo. Aqui são
 * nove grupos em combinações livres: cada treino acende um conjunto diferente,
 * e isso são dezenas de imagens que teriam de existir antes. Em vetor é um
 * desenho e um conjunto de ids.
 *
 * A anatomia é propositalmente grosseira. O que a figura precisa comunicar é
 * **região** — alto, meio, baixo, frente, trás —, e detalhe demais num desenho
 * de 128px vira mancha.
 */

/** Uma região desenhada: a figura em que ela aparece e o traçado. */
type Regiao = {
  grupo: MuscleGroup
  face: 'frente' | 'costas'
  d: string
}

/**
 * O corpo, em peças, num quadro de 72 × 150.
 *
 * Peças separadas, e não um traçado só: cabeça, pescoço, tronco, dois braços e
 * duas pernas se acertam uma de cada vez, e um `d` gigante com trinta curvas
 * não se corrige — se reescreve.
 *
 * Elas **se sobrepõem** de propósito nas juntas, e a opacidade vai no grupo,
 * não em cada peça. Por peça, a sobreposição soma: desenha uma emenda clara no
 * ombro e um degrau no quadril, que foi exatamente o que apareceu nas duas
 * primeiras tentativas. No grupo, a união é composta uma vez e o corpo vira
 * uma silhueta só.
 */
const CONTORNO = [
  'M36 4a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z',
  'M32 20h8v8h-8z',
  'M26 27h20c6 1 9 5 9 10l-6 24c-1 5-1 8 0 12l2 13H21l2-13c1-4 1-7 0-12l-6-24c0-5 3-9 9-10z',
  'M18 35c-4 2-5 6-6 11l-2 22c0 5 1 9 2 13 1 3 4 3 5 0 1-4 1-8 1-13l2-22z',
  'M54 35c4 2 5 6 6 11l2 22c0 5-1 9-2 13-1 3-4 3-5 0-1-4-1-8-1-13l-2-22z',
  'M21 82h14.2l-1 30-1 25c0 4-2 6-5 6s-5-2-5-6l-1-25z',
  'M51 82H36.8l1 30 1 25c0 4 2 6 5 6s5-2 5-6l1-25z',
]

/*
 * As regiões acesas, no mesmo quadro.
 *
 * `CARDIO` e `FULL_BODY` não têm traçado próprio: o primeiro não é um músculo,
 * e o segundo é todos. Os dois são resolvidos em `acende()`.
 */
const REGIOES: Regiao[] = [
  {
    grupo: 'SHOULDERS',
    face: 'frente',
    d: 'M25 28c-6 1-9 5-9 11 0 3 3 4 6 2 3-2 6-6 6-10 0-2-1-3-3-3z',
  },
  {
    grupo: 'SHOULDERS',
    face: 'frente',
    d: 'M47 28c6 1 9 5 9 11 0 3-3 4-6 2-3-2-6-6-6-10 0-2 1-3 3-3z',
  },
  { grupo: 'CHEST', face: 'frente', d: 'M35 34v12c0 2-2 4-5 4-5 0-9-3-9-8s4-8 9-8z' },
  { grupo: 'CHEST', face: 'frente', d: 'M37 34v12c0 2 2 4 5 4 5 0 9-3 9-8s-4-8-9-8z' },
  { grupo: 'ARMS', face: 'frente', d: 'M17 40c-2 4-3 9-3 15 0 4 2 6 4 6s3-2 4-6c0-6 0-11-1-15z' },
  { grupo: 'ARMS', face: 'frente', d: 'M55 40c2 4 3 9 3 15 0 4-2 6-4 6s-3-2-4-6c0-6 0-11 1-15z' },
  { grupo: 'CORE', face: 'frente', d: 'M29 52h14l-1 16c0 6-3 9-6 9s-6-3-6-9z' },
  { grupo: 'LEGS', face: 'frente', d: 'M23 88h11l-1 20c0 6-2 9-5 9s-5-3-5-9z' },
  { grupo: 'LEGS', face: 'frente', d: 'M49 88H38l1 20c0 6 2 9 5 9s5-3 5-9z' },
  {
    grupo: 'SHOULDERS',
    face: 'costas',
    d: 'M25 28c-6 1-9 5-9 11 0 3 3 4 6 2 3-2 6-6 6-10 0-2-1-3-3-3z',
  },
  {
    grupo: 'SHOULDERS',
    face: 'costas',
    d: 'M47 28c6 1 9 5 9 11 0 3-3 4-6 2-3-2-6-6-6-10 0-2 1-3 3-3z',
  },
  { grupo: 'BACK', face: 'costas', d: 'M36 30l15 2-2 13c-1 8-6 13-13 13s-12-5-13-13l-2-13z' },
  { grupo: 'ARMS', face: 'costas', d: 'M17 40c-2 4-3 9-3 15 0 4 2 6 4 6s3-2 4-6c0-6 0-11-1-15z' },
  { grupo: 'ARMS', face: 'costas', d: 'M55 40c2 4 3 9 3 15 0 4-2 6-4 6s-3-2-4-6c0-6 0-11 1-15z' },
  { grupo: 'GLUTES', face: 'costas', d: 'M35 69c0 0 0 16 0 16-7 1-12-2-12-8 0-5 5-8 12-8z' },
  { grupo: 'GLUTES', face: 'costas', d: 'M37 69c0 0 0 16 0 16 7 1 12-2 12-8 0-5-5-8-12-8z' },
  { grupo: 'LEGS', face: 'costas', d: 'M23 88h11l-1 20c0 6-2 9-5 9s-5-3-5-9z' },
  { grupo: 'LEGS', face: 'costas', d: 'M49 88H38l1 20c0 6 2 9 5 9s5-3 5-9z' },
]

/**
 * O grupo está aceso?
 *
 * `FULL_BODY` acende tudo, que é o que ele quer dizer. `CARDIO` não acende
 * músculo nenhum — e isso é a resposta certa, não uma falha: o treino de
 * esteira não é de peito nem de perna, e fingir que é seria pior que a figura
 * apagada. Nesse caso o corpo inteiro respira, em vez de uma região.
 */
function acende(grupo: MuscleGroup, trabalhados: Set<MuscleGroup>) {
  if (trabalhados.has('FULL_BODY')) return true
  return trabalhados.has(grupo)
}

type Props = {
  /** Os grupos que o treino trabalha. */
  grupos: MuscleGroup[]
  /** Descrição para quem usa leitor de tela. Vazia deixa a figura decorativa. */
  descricao?: string
  className?: string
}

export function SilhuetaMuscular({ grupos, descricao, className }: Props) {
  const trabalhados = new Set(grupos)
  const soCardio = trabalhados.has('CARDIO') && trabalhados.size === 1

  return (
    <svg
      viewBox="0 0 158 152"
      className={className}
      role={descricao ? 'img' : undefined}
      aria-label={descricao}
      aria-hidden={descricao ? undefined : true}
    >
      <defs>
        {/*
         * O brilho é um desfoque do próprio traçado, e não uma sombra: sombra
         * tem direção, e luz que vem de dentro do músculo não tem.
         */}
        <filter id="synse-brilho-do-musculo" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="borrado" />
          <feMerge>
            <feMergeNode in="borrado" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {(['frente', 'costas'] as const).map((face, i) => (
        <g key={face} transform={`translate(${i * 86} 0)`}>
          {/*
           * O corpo apagado é o palco. Fica bem fraco de propósito: o que a
           * pessoa precisa ver primeiro é o que está **aceso**, e um contorno
           * forte competiria com isso.
           */}
          <g
            className={`fill-current opacity-[0.16] ${
              soCardio ? 'motion-safe:animate-pulso-do-musculo' : ''
            }`}
          >
            {CONTORNO.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>

          {REGIOES.filter((r) => r.face === face && acende(r.grupo, trabalhados)).map((r, j) => (
            <path
              key={`${r.grupo}-${j}`}
              d={r.d}
              filter="url(#synse-brilho-do-musculo)"
              className="fill-synse-primary-light opacity-80 motion-safe:animate-pulso-do-musculo"
              /*
               * O atraso escalonado faz as regiões respirarem em tempos
               * diferentes. Todas pulsando juntas lê como piscar de aviso;
               * defasadas, lê como corpo vivo.
               */
              style={{ animationDelay: `${j * 0.22}s` }}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
