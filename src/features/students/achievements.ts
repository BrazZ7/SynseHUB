/**
 * As conquistas do perfil.
 *
 * ── Diferentes das medalhas de desafio ──────────────────────────────────────
 *
 * `challenge_medals` guarda o resultado de um ciclo mensal: a pessoa escolhe
 * um desafio, o mês fecha, e ela recebe ouro, prata, bronze ou participação.
 * São do calendário.
 *
 * Estas são marcos: o primeiro treino, os primeiros cinco quilômetros, a
 * sequência de sete dias. Não têm ciclo nem competição — ou aconteceram, ou
 * não. E como são função direta do histórico, não precisam de tabela: a
 * mesma regra que as concede é a que as verifica, e ninguém pode ficar com uma
 * conquista que o histórico não sustenta.
 *
 * A última da lista fica sempre trancada de propósito. Uma estante cheia diz
 * "acabou"; uma com um espaço vazio diz que ainda há o que buscar.
 */

export type Conquista = {
  code: string
  nome: string
  descricao: string
  /** O ícone é escolhido pela tela; aqui vai só o nome dele. */
  icone: 'treino' | 'corrida' | 'chama' | 'montanha' | 'trofeu' | 'peso'
  conquistada: boolean
  /** Quanto falta, em texto, para as que ainda não vieram. */
  progresso: string | null
}

export type HistoricoParaConquistas = {
  treinos: number
  quilometros: number
  maiorSequencia: number
  medalhas: number
  maiorCargaKg: number
  desafiosConcluidos: number
}

/**
 * O catálogo.
 *
 * Cada marco declara o que exige e como se mede o quanto falta. Manter as duas
 * coisas juntas é o que impede a tela de dizer "faltam 2 km" para um marco que
 * conta treinos.
 */
const CATALOGO: {
  code: string
  nome: string
  descricao: string
  icone: Conquista['icone']
  alvo: number
  medir: (h: HistoricoParaConquistas) => number
  unidade: (falta: number) => string
}[] = [
  {
    code: 'PRIMEIRO_TREINO',
    nome: 'Primeiro Treino',
    descricao: 'Concluir o primeiro treino no Synse.',
    icone: 'treino',
    alvo: 1,
    medir: (h) => h.treinos,
    unidade: () => 'Conclua um treino',
  },
  {
    code: 'CORRIDA_5K',
    nome: '5K Run',
    descricao: 'Somar cinco quilômetros de corrida ou caminhada.',
    icone: 'corrida',
    alvo: 5,
    medir: (h) => h.quilometros,
    unidade: (falta) => `Faltam ${falta.toFixed(1)} km`,
  },
  {
    code: 'SEQUENCIA_7',
    nome: 'Sequência 7 Dias',
    descricao: 'Sete dias seguidos de treino.',
    icone: 'chama',
    alvo: 7,
    medir: (h) => h.maiorSequencia,
    unidade: (falta) => `Faltam ${Math.ceil(falta)} dias`,
  },
  {
    code: 'DESAFIO_CONCLUIDO',
    nome: 'Desafio Concluído',
    descricao: 'Fechar um desafio do mês.',
    icone: 'montanha',
    alvo: 1,
    medir: (h) => h.desafiosConcluidos,
    unidade: () => 'Conclua um desafio',
  },
  {
    code: 'CARGA_100',
    nome: 'Cem Quilos',
    descricao: 'Registrar uma série com cem quilos ou mais.',
    icone: 'peso',
    alvo: 100,
    medir: (h) => h.maiorCargaKg,
    unidade: (falta) => `Faltam ${Math.ceil(falta)} kg`,
  },
  {
    code: 'TRES_MEDALHAS',
    nome: 'Colecionador',
    descricao: 'Conquistar três medalhas de desafio.',
    icone: 'trofeu',
    alvo: 3,
    medir: (h) => h.medalhas,
    unidade: (falta) => `Faltam ${Math.ceil(falta)}`,
  },
]

export function calcularConquistas(historico: HistoricoParaConquistas): Conquista[] {
  return CATALOGO.map((marco) => {
    const atual = marco.medir(historico)
    const conquistada = atual >= marco.alvo

    return {
      code: marco.code,
      nome: marco.nome,
      descricao: marco.descricao,
      icone: marco.icone,
      conquistada,
      progresso: conquistada ? null : marco.unidade(marco.alvo - atual),
    }
  })
}

/**
 * O que a estante mostra.
 *
 * As conquistadas primeiro, na ordem do catálogo, e **uma** por conquistar no
 * fim. Mostrar todas as pendentes transformaria a estante numa lista de
 * tarefas; mostrar nenhuma tiraria o próximo passo de vista.
 */
export function estanteDeConquistas(historico: HistoricoParaConquistas, limite = 5): Conquista[] {
  const todas = calcularConquistas(historico)
  const feitas = todas.filter((c) => c.conquistada)
  const proxima = todas.find((c) => !c.conquistada)

  const visiveis = feitas.slice(0, Math.max(0, limite - (proxima ? 1 : 0)))
  return proxima ? [...visiveis, proxima] : visiveis
}
