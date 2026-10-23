import type { BodyMeasurementSource } from '@/types/domain'

/**
 * ── O vocabulário da plataforma de saúde ─────────────────────────────────────
 *
 * Apple Saúde e Health Connect não guardam "uma pesagem". Guardam **amostras
 * soltas**: o peso é uma, o percentual de gordura é outra, a massa magra é uma
 * terceira. Uma balança inteligente que sincroniza com elas escreve cinco ou
 * seis amostras com o mesmo instante, e quem lê precisa remontar a pesagem.
 *
 * Este módulo é puro de propósito — nada de Capacitor, nada de React, nada de
 * banco. É o que permite testar a remontagem, a janela de importação e as
 * armadilhas de unidade sem um iPhone na mesa. E as armadilhas são o ponto:
 * nenhuma delas falha de forma visível. Todas gravam um número errado no
 * histórico de saúde de alguém, que é o pior lugar para errar em silêncio.
 */

/** O que o Synse sabe ler de uma plataforma de saúde. */
export type TipoDeAmostra =
  | 'PESO'
  | 'GORDURA_PERCENTUAL'
  | 'MASSA_MAGRA'
  | 'MASSA_OSSEA'
  | 'AGUA_CORPORAL'
  | 'IMC'
  | 'METABOLISMO_BASAL'

/**
 * Uma amostra, já na unidade do Synse.
 *
 * A conversão de unidade é responsabilidade do **provider**, não daqui, e isso
 * é deliberado: cada plataforma erra de um jeito diferente (ver
 * `UNIDADE_ESPERADA`), e deixar a conversão perto da plataforma é o que impede
 * uma correção para o iOS de quebrar o Android.
 */
export type AmostraDeSaude = {
  /**
   * O identificador que a própria plataforma dá à amostra.
   *
   * É ele que torna a reimportação inofensiva: vira `clientId`, e o banco tem
   * `unique (user_profile_id, client_id)`. Sem um id estável, importar duas
   * vezes duplicaria o histórico inteiro.
   */
  idNaPlataforma: string
  tipo: TipoDeAmostra
  /** Já na unidade do Synse. Ver `UNIDADE_ESPERADA`. */
  valor: number
  /** Instante da medição, ISO 8601. */
  medidaEm: string
  /**
   * Quem escreveu esta amostra na plataforma — "Mi Fit", "Withings", "Synse".
   *
   * Não é enfeite: é o que impede o laço. Ver `ehEcoDoSynse`.
   */
  appDeOrigem: string | null
  /** O aparelho que a plataforma associa à amostra, quando ela associa. */
  aparelhoDeOrigem: string | null
}

/**
 * A unidade em que cada tipo chega **aqui dentro**.
 *
 * Existe escrito porque as duas plataformas discordam, e discordam no silêncio:
 *
 * - **Gordura corporal.** A Apple entrega *fração* (0,22 para 22%); o Health
 *   Connect entrega *percentual* (22,0). Quem trata os dois igual publica 0,22%
 *   de gordura para metade dos usuários e 2.200% para a outra metade.
 * - **Água corporal.** O Health Connect entrega **massa em quilo**, e o Synse
 *   guarda percentual — a mesma armadilha do padrão Bluetooth. A conta é do
 *   Synse, e por isso o campo sai como calculado, nunca como medido.
 * - **Metabolismo basal.** O Health Connect entrega *potência* (kcal/dia ou
 *   watt); a Apple não tem o tipo — `basalEnergyBurned` é energia **acumulada**
 *   no período, que não é metabolismo basal e não entra aqui.
 *
 * O provider converte para esta tabela antes de devolver a amostra.
 */
export const UNIDADE_ESPERADA: Record<TipoDeAmostra, string> = {
  PESO: 'kg',
  GORDURA_PERCENTUAL: '% (0–100)',
  MASSA_MAGRA: 'kg',
  MASSA_OSSEA: 'kg',
  AGUA_CORPORAL: 'kg',
  IMC: 'kg/m²',
  METABOLISMO_BASAL: 'kcal/dia',
}

/** As fontes que este módulo atende. */
export type FonteDeSaudeId = 'apple_health' | 'health_connect'

export const SOURCE_DA_FONTE: Record<FonteDeSaudeId, BodyMeasurementSource> = {
  apple_health: 'APPLE_HEALTH',
  health_connect: 'HEALTH_CONNECT',
}

export const ROTULO_DA_FONTE: Record<FonteDeSaudeId, string> = {
  apple_health: 'Apple Saúde',
  health_connect: 'Health Connect',
}

/** O prefixo do `clientId`, para a origem ficar legível no banco. */
const PREFIXO: Record<FonteDeSaudeId, string> = {
  apple_health: 'ah',
  health_connect: 'hc',
}

/**
 * O prefixo do caso curto.
 *
 * Disjunto do normal por construção — o terceiro caractere difere —, e é isso
 * que garante que um id curto e um id longo nunca produzam o mesmo
 * `clientId`. Ver `clientIdDaAmostra`.
 */
const PREFIXO_CURTO: Record<FonteDeSaudeId, string> = {
  apple_health: 'ahz',
  health_connect: 'hcz',
}

/** O mínimo que o schema de validação aceita. */
const MINIMO = 8
const MAXIMO = 64

/**
 * O `clientId` de uma pesagem importada.
 *
 * Deriva do id que a plataforma deu à **amostra de peso** do grupo, e é esse
 * ancoramento que torna a importação idempotente: rodar de novo devolve o
 * mesmo id, o banco reconhece o conflito e nada duplica.
 *
 * Por que a amostra de peso e não um hash do grupo inteiro: se o `clientId`
 * dependesse do conteúdo, uma pesagem que ganhasse o percentual de gordura
 * depois viraria **outra** pesagem, e o histórico mostraria a mesma subida na
 * balança duas vezes.
 *
 * O schema de validação exige de 8 a 64 caracteres. Um UUID da Apple tem 36;
 * com o prefixo, 39. O corte em 64 protege de um id de plataforma fora do
 * comum — e corte é melhor que recusa, porque o prefixo mais os primeiros 61
 * caracteres continuam únicos na prática.
 */
export function clientIdDaAmostra(fonte: FonteDeSaudeId, idNaPlataforma: string): string {
  const limpo = idNaPlataforma.trim()
  if (!limpo) throw new Error('Amostra sem identificador de plataforma.')

  const normal = `${PREFIXO[fonte]}-${limpo}`
  if (normal.length >= MINIMO) return normal.slice(0, MAXIMO)

  /*
   * ── O id curto demais ─────────────────────────────────────────────────────
   *
   * Na prática não acontece: as duas plataformas dão UUID, e UUID tem 36
   * caracteres. Mas o schema exige 8, e a saída óbvia — completar com um
   * caractere de enchimento — **funde duas pesagens em uma**: com `-` de
   * enchimento, os ids `a1` e `a1---` produziriam o mesmo `clientId`, e a
   * segunda sobrescreveria a primeira no banco. Perder uma pesagem em
   * silêncio é pior do que qualquer coisa que isto está evitando.
   *
   * A saída é um prefixo de comprimento, que é injetivo: `hcz-2-a1` só pode
   * ter vindo de um id de dois caracteres. E o prefixo `hcz` é disjunto do
   * `hc` normal no terceiro caractere, então os dois ramos nunca se cruzam.
   */
  return `${PREFIXO_CURTO[fonte]}-${limpo.length}-${limpo}`.padEnd(MINIMO, '0').slice(0, MAXIMO)
}

/**
 * Esta amostra foi o próprio Synse que escreveu?
 *
 * Sem esta checagem existe um laço: o Synse grava a pesagem na plataforma de
 * saúde, a importação seguinte lê a mesma pesagem de volta e cria uma segunda
 * linha — com `clientId` diferente, porque o id da amostra é da plataforma.
 * O histórico dobraria sozinho a cada sincronização.
 *
 * A comparação é frouxa (sem maiúsculas, sem espaços) porque o nome do app
 * chega de jeitos diferentes: "Synse", "synse", "br.com.synse.app".
 */
export const NOMES_DO_SYNSE = ['synse', 'br.com.synse.app']

export function ehEcoDoSynse(amostra: AmostraDeSaude): boolean {
  const nome = amostra.appDeOrigem?.trim().toLowerCase()
  if (!nome) return false
  return NOMES_DO_SYNSE.some((proprio) => nome === proprio || nome.includes('synse'))
}

/**
 * ── A janela de importação ───────────────────────────────────────────────────
 *
 * Duas perguntas diferentes, e misturá-las dá problema nos dois sentidos.
 */

/**
 * Quanto a primeira importação vai buscar para trás.
 *
 * Um ano. Não é o histórico inteiro de propósito: quem usa balança conectada
 * há cinco anos tem milhares de amostras, e trazer tudo de uma vez numa
 * primeira conexão significa uma espera longa, uma rajada no servidor e um
 * gráfico que a pessoa não pediu. Um ano cobre a comparação que alguém
 * realmente faz — "como eu estava no ano passado".
 */
export const PRIMEIRA_JANELA_DIAS = 365

/**
 * O quanto cada importação seguinte volta **antes** da última já importada.
 *
 * Amostra de saúde chega atrasada: a balança guarda a pesagem e só sincroniza
 * quando o celular do dono passa perto, o que pode ser no dia seguinte. Uma
 * janela que começasse exatamente na última importada perderia essas — para
 * sempre, porque a janela nunca mais passaria por ali.
 *
 * Reimportar sete dias a cada sincronização é barato: o `clientId` estável faz
 * o que já entrou ser reconhecido e descartado pelo banco.
 */
export const SOBREPOSICAO_DIAS = 7

/** Teto de amostras por importação, para uma primeira conexão não virar rajada. */
export const TETO_DE_AMOSTRAS = 2_000

export type JanelaDeImportacao = { de: Date; ate: Date; primeiraVez: boolean }

export function janelaDeImportacao(opcoes: {
  /** O instante da pesagem mais recente que já veio desta fonte. */
  ultimaImportadaEm?: string | Date | null
  agora?: Date
}): JanelaDeImportacao {
  const ate = opcoes.agora ?? new Date()
  const ultima = opcoes.ultimaImportadaEm ? new Date(opcoes.ultimaImportadaEm) : null

  if (!ultima || Number.isNaN(ultima.getTime())) {
    return { de: diasAntes(ate, PRIMEIRA_JANELA_DIAS), ate, primeiraVez: true }
  }

  /*
   * A janela nunca vai além da primeira: se a última importada for muito
   * antiga — alguém que conectou, sumiu por dois anos e voltou — a
   * sobreposição sozinha traria dois anos de amostras de uma vez.
   */
  const comSobreposicao = diasAntes(ultima, SOBREPOSICAO_DIAS)
  const limite = diasAntes(ate, PRIMEIRA_JANELA_DIAS)
  return { de: comSobreposicao > limite ? comSobreposicao : limite, ate, primeiraVez: false }
}

function diasAntes(data: Date, dias: number): Date {
  return new Date(data.getTime() - dias * 86_400_000)
}
