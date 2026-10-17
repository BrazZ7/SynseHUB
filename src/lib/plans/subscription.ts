/**
 * ── A assinatura do Synse+, do lado da aplicação ────────────────────────────
 *
 * O modelo, decidido pelo dono do produto: **uma assinatura só**. O primeiro
 * ciclo custa R$ 0,00, e no fim dele renova sozinha pelo valor cheio, até a
 * pessoa cancelar.
 *
 * Isto aqui só lê e interpreta o que a 0036 grava. Quem escreve é
 * `set_plus_subscription`, no banco, chamada pela confirmação de pagamento —
 * nunca pela tela, e nunca por este arquivo.
 *
 * Tudo é função pura sobre a linha da conta, pelo mesmo motivo do motor da
 * análise: é conta, e conta se testa.
 */

/** Espelha o `check` da coluna `plus_status` na 0036. */
export type PlusStatus = 'NONE' | 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED'

/**
 * Quem cobra esta assinatura. Espelha o `check` de `plus_provider` na 0061.
 *
 * Minúsculas porque é o que `PaymentProvider.id` usa, e porque é o que a
 * restrição do banco aceita — maiúsculas ali levantam exceção.
 */
export type OrigemDaAssinatura = 'mercadopago' | 'apple' | 'google'

export const ORIGENS: readonly OrigemDaAssinatura[] = ['mercadopago', 'apple', 'google']

export type PlusSubscription = {
  status: PlusStatus
  /** Fim do ciclo corrente, em ISO. Nulo em NONE e EXPIRED. */
  until: string | null
  /**
   * Onde a cobrança vive. Nulo quando não há assinatura — ou quando a 0061
   * ainda não subiu, que é o mesmo caso para quem lê.
   *
   * Existe porque com três origens "já é assinante" deixou de ser resposta
   * suficiente: quem assinou pela App Store não pode comprar de novo pela web,
   * e quem assinou na web não pode ser mandado a comprar dentro do app.
   */
  origem: OrigemDaAssinatura | null
}

export const SEM_ASSINATURA: PlusSubscription = { status: 'NONE', until: null, origem: null }

const ESTADOS: readonly PlusStatus[] = ['NONE', 'TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED']

/**
 * Lê a assinatura da linha da conta, tolerando a coluna ausente.
 *
 * Publicar não é migrar: entre o deploy e o SQL colado à mão, `plus_status`
 * não existe, e a leitura precisa devolver "sem assinatura" em vez de quebrar.
 * Estado desconhecido cai no mesmo lugar — um valor que este código não
 * reconhece não pode virar acesso liberado por omissão.
 */
export function lerAssinatura(linha: {
  plus_status?: string | null
  plus_until?: string | null
  plus_provider?: string | null
}): PlusSubscription {
  const bruto = linha.plus_status
  if (!bruto || !ESTADOS.includes(bruto as PlusStatus)) return SEM_ASSINATURA

  /*
   * Origem desconhecida vira nula em vez de passar adiante: um nome que este
   * código não reconhece não pode virar decisão de cobrança. É a mesma regra
   * do estado desconhecido, duas linhas acima.
   */
  const origem = linha.plus_provider
  return {
    status: bruto as PlusStatus,
    until: linha.plus_until ?? null,
    origem: origem && ORIGENS.includes(origem as OrigemDaAssinatura)
      ? (origem as OrigemDaAssinatura)
      : null,
  }
}

/**
 * O que a tela precisa saber, já mastigado.
 *
 * `ativa` não é derivado do `tier` de propósito. O `tier` é o que o banco
 * calculou quando a assinatura mudou pela última vez, e ele envelhece: uma
 * conta cujo ciclo venceu ontem continua PRO até a rotina de expiração rodar.
 * Aqui a data manda, porque é ela que não depende de ninguém ter rodado nada.
 */
export type ResumoDaAssinatura = {
  ativa: boolean
  emTeste: boolean
  /** Já cancelada, mas ainda dentro do período pago. */
  encerrando: boolean
  /** Dias inteiros até o fim do ciclo. Nulo sem data. */
  diasRestantes: number | null
  /** Quando cobra (em teste) ou quando renova (ativa). Nulo se não houver. */
  proximaCobranca: Date | null
}

const DIA_MS = 86_400_000

export function resumoDaAssinatura(
  /*
   * `Pick` e não `PlusSubscription`: esta função decide por estado e data, e
   * não olha a origem. Pedir o objeto inteiro só obrigaria quem chama — e todo
   * teste — a carregar um campo que não participa da conta.
   */
  assinatura: Pick<PlusSubscription, 'status' | 'until'>,
  agora: Date = new Date(),
): ResumoDaAssinatura {
  const fim = assinatura.until ? new Date(assinatura.until) : null
  const validoAte = fim && !Number.isNaN(fim.getTime()) ? fim : null
  const noPrazo = validoAte !== null && validoAte.getTime() > agora.getTime()

  const comPrazo = assinatura.status === 'TRIAL' || assinatura.status === 'ACTIVE'
  const ativa = (comPrazo || assinatura.status === 'CANCELED') && noPrazo

  return {
    ativa,
    emTeste: assinatura.status === 'TRIAL' && noPrazo,
    encerrando: assinatura.status === 'CANCELED' && noPrazo,
    /*
     * Arredonda para cima: faltando 18 horas, quem lê quer ver "1 dia", não
     * "0 dias" — que seria lido como "acabou" num aviso que existe para
     * avisar antes.
     */
    diasRestantes: validoAte
      ? Math.max(0, Math.ceil((validoAte.getTime() - agora.getTime()) / DIA_MS))
      : null,
    // Quem cancelou não tem próxima cobrança: a data que resta é só o fim.
    proximaCobranca: ativa && assinatura.status !== 'CANCELED' ? validoAte : null,
  }
}
