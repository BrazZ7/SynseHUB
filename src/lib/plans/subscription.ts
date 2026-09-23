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

export type PlusSubscription = {
  status: PlusStatus
  /** Fim do ciclo corrente, em ISO. Nulo em NONE e EXPIRED. */
  until: string | null
}

export const SEM_ASSINATURA: PlusSubscription = { status: 'NONE', until: null }

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
}): PlusSubscription {
  const bruto = linha.plus_status
  if (!bruto || !ESTADOS.includes(bruto as PlusStatus)) return SEM_ASSINATURA

  return { status: bruto as PlusStatus, until: linha.plus_until ?? null }
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
  assinatura: PlusSubscription,
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
