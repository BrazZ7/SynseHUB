import { describe, expect, it } from 'vitest'

import { duracao, pesoEmKg, plural, quilometros } from '@/features/students/numeros'
import {
  META_PADRAO,
  comparar,
  frase,
  inicioDaSemanaLocal,
  metaDaSemana,
  percentualDaMeta,
  semanasRecentes,
  tempoEmMovimento,
} from '@/features/students/semana'
import type { WeekSummary } from '@/types/domain'

/**
 * O resumo semanal, do lado de cá (0066).
 *
 * A conta de produção é do banco. Isto cobre duas coisas diferentes:
 *
 *  1. **O agrupamento por semana da demonstração**, que é a duplicação
 *     necessária — a demonstração não tem banco. A equivalência com o SQL é
 *     verificada em `tests/db/resumo-da-semana.test.ts`, evento por evento;
 *     aqui está a regra em si.
 *  2. **A leitura dos números**, que é da tela: a meta declarada contra a
 *     padrão, a comparação com a semana passada, a frase de abertura.
 */

const FUSO = 'America/Sao_Paulo'

const semana = (parcial: Partial<WeekSummary> = {}): WeekSummary => ({
  weekStart: '2026-10-26',
  daysTrained: 0,
  workouts: 0,
  workoutSeconds: 0,
  volumeKg: 0,
  setsCount: 0,
  runs: 0,
  runSeconds: 0,
  distanceMeters: 0,
  checkIns: 0,
  avgEffort: null,
  weightKg: null,
  targetDays: null,
  ...parcial,
})

describe('a semana começa na segunda, no fuso da academia', () => {
  it('a segunda-feira é o começo dela mesma', () => {
    // 2026-10-26 é uma segunda.
    expect(inicioDaSemanaLocal('2026-10-26T12:00:00Z', FUSO)).toBe('2026-10-26')
  })

  it('o domingo fecha a semana, não abre a seguinte', () => {
    /*
     * A escolha que tem de bater com `date_trunc('week')` do Postgres. Com
     * semana começando no domingo, metade dos treinos de fim de semana mudaria
     * de lado — e a demonstração discordaria de produção na mesma tela.
     */
    expect(inicioDaSemanaLocal('2026-11-01T12:00:00Z', FUSO)).toBe('2026-10-26')
  })

  it('domingo às 22h em Brasília continua na semana que acabou', () => {
    /*
     * ── O defeito que isto impede ─────────────────────────────────────────
     *
     * `2026-11-02T01:00:00Z` é segunda em UTC e domingo 22h em São Paulo. Em
     * UTC este treino pula para a semana seguinte, e com ele tudo o que
     * acontece depois das 21h.
     */
    const instante = '2026-11-02T01:00:00Z'
    expect(new Date(instante).getUTCDay()).toBe(1) // segunda, em UTC
    expect(inicioDaSemanaLocal(instante, FUSO)).toBe('2026-10-26')
    // E a prova de que o fuso é quem decide: em UTC, a outra semana.
    expect(inicioDaSemanaLocal(instante, 'UTC')).toBe('2026-11-02')
  })

  it('segunda às 00h30 em Brasília já é a semana nova', () => {
    // A outra ponta: 03h30 UTC de segunda é 00h30 local, semana nova.
    expect(inicioDaSemanaLocal('2026-10-26T03:30:00Z', FUSO)).toBe('2026-10-26')
    // Uma hora antes, ainda domingo local.
    expect(inicioDaSemanaLocal('2026-10-26T02:30:00Z', FUSO)).toBe('2026-10-19')
  })

  it('aceita Date e string', () => {
    expect(inicioDaSemanaLocal(new Date('2026-10-28T12:00:00Z'), FUSO)).toBe('2026-10-26')
  })

  it('num fuso a leste o dia vira antes', () => {
    /*
     * Tóquio é UTC+9: domingo 16h UTC já é segunda de manhã lá. O mesmo
     * instante cai em duas semanas diferentes, e é o fuso de quem treina que
     * manda — não o do servidor.
     */
    expect(inicioDaSemanaLocal('2026-11-01T16:00:00Z', 'Asia/Tokyo')).toBe('2026-11-02')
    expect(inicioDaSemanaLocal('2026-11-01T16:00:00Z', FUSO)).toBe('2026-10-26')
  })
})

describe('as semanas recentes', () => {
  const agora = new Date('2026-10-31T15:00:00Z') // sábado

  it('vêm da mais recente para a mais antiga', () => {
    expect(semanasRecentes(agora, FUSO, 3)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12'])
  })

  it('nunca vêm vazias: a tela sempre tem uma semana', () => {
    expect(semanasRecentes(agora, FUSO, 0)).toEqual(['2026-10-26'])
    expect(semanasRecentes(agora, FUSO, -3)).toEqual(['2026-10-26'])
  })

  it('atravessam a virada de mês e de ano', () => {
    const janeiro = new Date('2027-01-05T15:00:00Z') // terça
    expect(semanasRecentes(janeiro, FUSO, 3)).toEqual(['2027-01-04', '2026-12-28', '2026-12-21'])
  })
})

describe('a meta da semana', () => {
  it('é a declarada quando o aluno respondeu', () => {
    expect(metaDaSemana(3)).toEqual({ dias: 3, declarada: true })
    expect(metaDaSemana(7)).toEqual({ dias: 7, declarada: true })
  })

  it('cai no padrão quando ninguém respondeu — e diz que caiu', () => {
    /*
     * `declarada: false` é o que deixa a tela escrever "meta padrão" em vez de
     * fingir que a pessoa escolheu cinco. O anel pela metade de quem nunca
     * escolheu é um julgamento que ninguém pediu.
     */
    expect(metaDaSemana(null)).toEqual({ dias: META_PADRAO, declarada: false })
    expect(metaDaSemana(undefined)).toEqual({ dias: META_PADRAO, declarada: false })
  })

  it('zero e negativo são padrão, não meta', () => {
    // O `check` do banco é 1..7, mas a função não confia nisso: meta zero
    // faria o percentual dividir por zero.
    expect(metaDaSemana(0).declarada).toBe(false)
    expect(metaDaSemana(-2).declarada).toBe(false)
  })
})

describe('o percentual da meta', () => {
  it('cumpriu a meta é 100, e passar dela não vira 140', () => {
    expect(percentualDaMeta(3, 3)).toBe(100)
    expect(percentualDaMeta(7, 5)).toBe(100)
  })

  it('arredonda, e a semana vazia é zero', () => {
    expect(percentualDaMeta(1, 3)).toBe(33)
    expect(percentualDaMeta(2, 3)).toBe(67)
    expect(percentualDaMeta(0, 4)).toBe(0)
  })

  it('meta zero não explode', () => {
    expect(percentualDaMeta(2, 0)).toBe(0)
  })
})

describe('a comparação com a semana passada', () => {
  it('sem semana anterior não há direção — e isso não é "igual"', () => {
    /*
     * A distinção que mantém o resumo honesto: quem não se pesou na semana
     * passada não manteve o peso. Tratar ausência como igualdade é como um
     * resumo passa a afirmar o que não sabe.
     */
    expect(comparar(80, null)).toEqual({ delta: 0, direcao: null })
    expect(comparar(null, 80)).toEqual({ delta: 0, direcao: null })
    expect(comparar(undefined, undefined).direcao).toBeNull()
  })

  it('subiu, caiu e igual', () => {
    expect(comparar(4, 2)).toEqual({ delta: 2, direcao: 'subiu' })
    expect(comparar(2, 4)).toEqual({ delta: -2, direcao: 'caiu' })
    expect(comparar(3, 3)).toEqual({ delta: 0, direcao: 'igual' })
  })

  it('resto de ponto flutuante não desenha seta', () => {
    /*
     * Estes números vêm de `numeric` do Postgres e de somas de ponto
     * flutuante. Sem a tolerância, 80,1 contra 80,1 desenharia uma seta de
     * subida para quem não mudou nada.
     */
    expect(comparar(0.1 + 0.2, 0.3).direcao).toBe('igual')
    expect(comparar(80.1 * 3, 240.3).direcao).toBe('igual')
  })

  it('diferença real pequena ainda conta', () => {
    expect(comparar(80.2, 80.1).direcao).toBe('subiu')
  })
})

describe('a frase de abertura', () => {
  it('não repreende quem ainda não começou', () => {
    expect(frase(semana({ daysTrained: 0, targetDays: 4 }))).toBe('A semana está começando.')
  })

  it('celebra a meta cumprida, e passar dela também cumpre', () => {
    expect(frase(semana({ daysTrained: 3, targetDays: 3 }))).toBe('Meta da semana cumprida.')
    expect(frase(semana({ daysTrained: 6, targetDays: 3 }))).toBe('Meta da semana cumprida.')
  })

  it('conta quanto falta, no singular e no plural', () => {
    expect(frase(semana({ daysTrained: 2, targetDays: 3 }))).toBe(
      'Falta um dia para fechar a semana.',
    )
    expect(frase(semana({ daysTrained: 1, targetDays: 4 }))).toBe(
      'Faltam 3 dias para fechar a semana.',
    )
  })

  it('sem meta declarada, usa o padrão para contar', () => {
    expect(frase(semana({ daysTrained: 4, targetDays: null }))).toBe(
      'Falta um dia para fechar a semana.',
    )
  })
})

describe('o tempo em movimento', () => {
  it('soma treino e corrida', () => {
    expect(tempoEmMovimento(semana({ workoutSeconds: 3600, runSeconds: 1800 }))).toBe('1h30')
  })

  it('só treino, só corrida', () => {
    expect(tempoEmMovimento(semana({ workoutSeconds: 2700 }))).toBe('45 min')
    expect(tempoEmMovimento(semana({ runSeconds: 600 }))).toBe('10 min')
  })

  it('semana sem nada não vira "0 min"', () => {
    // A regra herdada do histórico: número verdadeiro que lê como defeito.
    expect(tempoEmMovimento(semana())).toBeNull()
    expect(tempoEmMovimento(semana({ workoutSeconds: 40, runSeconds: 15 }))).toBeNull()
  })
})

describe('os números em texto', () => {
  it('a duração não escreve "0 min" para o que durou segundos', () => {
    expect(duracao(20)).toBeNull()
    expect(duracao(59)).toBeNull()
    expect(duracao(60)).toBe('1 min')
    expect(duracao(null)).toBeNull()
  })

  it('a duração passa a horas quando passa de uma', () => {
    expect(duracao(3600)).toBe('1h00')
    expect(duracao(5400)).toBe('1h30')
    expect(duracao(7380)).toBe('2h03')
  })

  it('o quilômetro não carrega zero à direita', () => {
    expect(quilometros(5000)).toBe('5 km')
    expect(quilometros(7540)).toBe('7,5 km')
    expect(quilometros(0)).toBe('0 km')
    expect(quilometros(null)).toBe('0 km')
  })

  it('o peso tem uma casa e vírgula, como a balança', () => {
    expect(pesoEmKg(80)).toBe('80,0 kg')
    expect(pesoEmKg(79.25)).toBe('79,3 kg')
  })

  it('a concordância é de verdade, sem "(s)"', () => {
    /*
     * "1 atividade(s)" é texto de rascunho que chegou à tela — eu o vi no
     * navegador antes deste teste existir. Numa tela aberta toda semana, ele
     * aparece toda semana.
     */
    expect(plural(1, 'atividade', 'atividades')).toBe('atividade')
    expect(plural(2, 'treino', 'treinos')).toBe('treinos')
    // Zero é plural em português: "0 treinos".
    expect(plural(0, 'treino', 'treinos')).toBe('treinos')
    // E a diferença de -1 também é singular: "caiu 1 treino".
    expect(plural(-1, 'treino', 'treinos')).toBe('treino')
  })
})
