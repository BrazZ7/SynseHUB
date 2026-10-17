/**
 * O catálogo de eventos do produto.
 *
 * ── Por que existe um catálogo, e por que ele é fechado ─────────────────────
 *
 * O pedido é explícito: "definir o significado e a origem de cada evento". Sem
 * isso, uma série temporal com seis meses de dados é ilegível — ninguém lembra
 * se `TREINO_CONCLUIDO` era o toque na última série ou o toque em "fechar", e a
 * diferença entre os dois é a resposta da pergunta que o indicador existe para
 * responder.
 *
 * O vocabulário é fechado no banco também (`check (name in (...))`, 0060).
 * Evento novo exige migration. É propositalmente chato.
 *
 * ── A separação que o pedido cobra ──────────────────────────────────────────
 *
 * Evento **técnico** fica em `src/lib/logger.ts`: erro, falha de integração,
 * latência. Serve para consertar o sistema.
 *
 * Evento **de produto** fica aqui: serve para saber se o produto funciona para
 * quem o usa. Os dois não se misturam porque as perguntas são outras e os
 * prazos de guarda também.
 *
 * ── O que não entra ────────────────────────────────────────────────────────
 *
 * Nada de saúde, nada de localização, nada que a pessoa digitou. A tabela não
 * tem campo livre para receber isso mesmo que alguém tente. E nada sai para
 * terceiros: não existe rastreador externo neste produto.
 */

export type NomeDeEvento =
  | 'ENTRADA_ESCOLHIDA'
  | 'CADASTRO_CONCLUIDO'
  | 'TREINO_INICIADO'
  | 'SERIE_CONCLUIDA'
  | 'SERIE_DESFEITA'
  | 'TREINO_CONCLUIDO'
  | 'TREINO_RECUPERADO'
  | 'REGISTRO_PERDIDO'
  | 'RESUMO_CONSULTADO'
  | 'COMPARTILHAMENTO_PEDIDO'
  | 'COMPARTILHAMENTO_CONFIRMADO'
  | 'LEMBRETE_ALTERADO'

export type RotuloDeEvento =
  | 'ACADEMIA'
  | 'PESSOAL'
  | 'TREINO'
  | 'SERIE'
  | 'CORRIDA'
  | 'PESO'
  | 'AULA'
  | 'SEMANA'
  | 'PROGRESSO'
  | 'LIGADO'
  | 'DESLIGADO'

export type Evento = {
  nome: NomeDeEvento
  /** O que o evento afirma. Uma frase, no indicativo. */
  significado: string
  /** De onde ele é emitido. Confere com a realidade — há teste. */
  origem: string
  /** Rótulos que este evento aceita. Vazio quando ele não leva nenhum. */
  rotulos: readonly RotuloDeEvento[]
}

/**
 * Os eventos, um por um.
 *
 * `origem` é caminho de arquivo de propósito: é o que permite ao teste conferir
 * que o evento declarado é emitido de onde o catálogo diz, em vez de o catálogo
 * virar documentação de algo que não acontece.
 */
export const EVENTOS: readonly Evento[] = [
  {
    nome: 'ENTRADA_ESCOLHIDA',
    significado:
      'A pessoa escolheu a porta: administrar uma academia, ou treinar. É o degrau anterior ao cadastro — a diferença entre os dois diz se o formulário está perdendo gente.',
    origem: 'src/app/onboarding/page.tsx',
    rotulos: ['ACADEMIA', 'PESSOAL'],
  },
  {
    nome: 'CADASTRO_CONCLUIDO',
    significado:
      'O cadastro terminou: a conta existe e tem academia ou matrícula. É o nascimento da coorte de retenção.',
    origem: 'src/features/onboarding/actions.ts',
    rotulos: ['ACADEMIA', 'PESSOAL'],
  },
  {
    nome: 'TREINO_INICIADO',
    significado:
      'O aluno abriu uma sessão de treino no servidor. O primeiro de cada pessoa é a "primeira ação útil".',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: [],
  },
  {
    nome: 'SERIE_CONCLUIDA',
    significado: 'Uma série entrou no registro. Uma por série, não uma por toque.',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: [],
  },
  {
    nome: 'SERIE_DESFEITA',
    significado:
      'Uma série concluída foi desfeita. Ao lado de SERIE_CONCLUIDA, mede o quanto o toque errado acontece.',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: [],
  },
  {
    nome: 'TREINO_CONCLUIDO',
    significado:
      'O treino foi encerrado no servidor como concluído, e `valor` é a duração em segundos. Abandonado não entra: é o par de TREINO_INICIADO no indicador "iniciados versus concluídos".',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: [],
  },
  {
    nome: 'TREINO_RECUPERADO',
    significado:
      'Um treino que ficou no aparelho chegou ao servidor depois — app fechado no meio, rede ausente. Mede recuperação de sessão.',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: [],
  },
  {
    nome: 'REGISTRO_PERDIDO',
    significado:
      'A fila desistiu de enviar. O rótulo diz se caiu treino inteiro ou série solta; `valor` diz quantos.',
    origem: 'src/features/active-workout/actions.ts',
    rotulos: ['TREINO', 'SERIE'],
  },
  {
    nome: 'RESUMO_CONSULTADO',
    significado: 'A pessoa abriu um resumo. O rótulo diz qual.',
    origem: 'src/app/(student)/app/progress/page.tsx',
    rotulos: ['SEMANA', 'PROGRESSO'],
  },
  {
    nome: 'COMPARTILHAMENTO_PEDIDO',
    significado:
      'A pessoa pediu para compartilhar. É **intenção**, não compartilhamento: o toque abre o menu do sistema, onde ela ainda escolhe para onde vai — ou fecha sem escolher.',
    origem: 'src/features/share/share-button.tsx',
    rotulos: ['TREINO', 'SEMANA', 'CORRIDA', 'PROGRESSO'],
  },
  {
    nome: 'COMPARTILHAMENTO_CONFIRMADO',
    significado:
      'O compartilhamento saiu: `navigator.share` resolveu, ou o arquivo foi baixado. Cancelar no menu do sistema chega como AbortError e não conta. Só este é compartilhamento.',
    origem: 'src/features/share/share-button.tsx',
    rotulos: ['TREINO', 'SEMANA', 'CORRIDA', 'PROGRESSO'],
  },
  {
    nome: 'LEMBRETE_ALTERADO',
    significado:
      'A preferência de lembrete mudou, e o rótulo é o estado em que ela ficou — observado depois da gravação, não a intenção do toque. Toque que falhou não desligou nada.',
    origem: 'src/features/push/actions.ts',
    rotulos: ['LIGADO', 'DESLIGADO'],
  },
] as const

/** O evento, pelo nome. */
export function evento(nome: NomeDeEvento): Evento | undefined {
  return EVENTOS.find((item) => item.nome === nome)
}

/**
 * O rótulo combina com o evento?
 *
 * Confere antes de ir ao banco para que o erro apareça aqui, como erro de
 * programação, e não como `check constraint` estourando no meio de uma operação
 * que a instrumentação deveria apenas observar.
 */
export function rotuloValido(nome: NomeDeEvento, rotulo?: RotuloDeEvento | null): boolean {
  const achado = evento(nome)
  if (!achado) return false
  // Evento sem rótulo declarado não aceita rótulo; com rótulo declarado, ele é
  // opcional — o rótulo detalha, não identifica.
  if (rotulo == null) return true
  return achado.rotulos.includes(rotulo)
}

/**
 * O que **não** é medido, e por quê.
 *
 * Está no código, e não só no documento de acompanhamento, porque indicador
 * ausente que ninguém registra volta como pergunta ("e o uso dos widgets?") e
 * recebe uma resposta inventada.
 */
export const NAO_MEDIDO: readonly { indicador: string; porque: string }[] = [
  {
    indicador: 'Uso dos widgets',
    porque:
      'Nenhuma superfície nativa envia ação ao servidor hoje: o iOS não tem target de Widget Extension, e as ações da notificação do Android não chegam a uma action. Contar a partir do que existe seria inventar o número.',
  },
  {
    indicador: 'Indicações convertidas em usuários ativos',
    porque: 'Não existe indicação no produto: nenhum convite, código ou link de indicação.',
  },
] as const
