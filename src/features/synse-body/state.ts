import type { BodyMeasurement, BodyMeasurementShare } from '@/types/domain'

/**
 * Constantes e tipos do Synse Body.
 *
 * Fora de `actions.ts` porque um arquivo `'use server'` só pode exportar
 * função assíncrona — `tests/unit/use-server-exports.test.ts` guarda a regra.
 */

export type RecordMeasurementResult =
  | { status: 'success'; measurementId: string; measurement: BodyMeasurement }
  | { status: 'error'; message: string }

export type DeviceResult =
  { status: 'success'; deviceId?: string } | { status: 'error'; message: string }

export type ShareResult = { status: 'success' } | { status: 'error'; message: string }

/**
 * O resultado de uma importação de plataforma de saúde.
 *
 * `gravadas` e `jaExistiam` são contas diferentes de propósito. "Importamos 0"
 * depois de uma sincronização soa como falha; "0 novas, 14 já estavam aqui"
 * diz que funcionou. A tela precisa das duas para não assustar quem sincroniza
 * duas vezes no mesmo dia.
 */
export type ImportHealthResult =
  | {
      status: 'success'
      /** Entraram no banco. Inclui as que já estavam lá com o mesmo `clientId`. */
      gravadas: number
      /**
       * O banco recusou.
       *
       * Conta separada de propósito. Reenviar uma pesagem que já existe **não**
       * é recusa: o `clientId` é o mesmo e a gravação devolve o id de sempre.
       * O que cai aqui é falha de verdade — e somar as duas numa contagem só
       * faria a tela dizer "já estava aqui" para algo que deu errado.
       */
      recusadas: number
    }
  | { status: 'error'; message: string }

/**
 * As janelas do histórico, com quanto cada uma pede em dias.
 *
 * O número existe para o limite de plano conseguir comparar: "3 meses" e "1
 * ano" são rótulos, e o corte precisa de grandeza. `0` é "tudo" — sem teto, e
 * por isso o caso que mais importa recortar no gratuito.
 */
export const PERIODOS = [
  { valor: '7d', rotulo: '7 dias', dias: 7 },
  { valor: '30d', rotulo: '30 dias', dias: 30 },
  { valor: '3m', rotulo: '3 meses', dias: 90 },
  { valor: '6m', rotulo: '6 meses', dias: 180 },
  { valor: '1a', rotulo: '1 ano', dias: 365 },
  { valor: 'tudo', rotulo: 'Tudo', dias: 0 },
] as const

/** O nome que a tela dá a cada campo, e a unidade. */
export const ROTULOS: Record<string, { nome: string; unidade: string; casas: number }> = {
  weightKg: { nome: 'Peso', unidade: 'kg', casas: 1 },
  bmi: { nome: 'IMC', unidade: '', casas: 1 },
  bodyFatPercent: { nome: 'Gordura corporal', unidade: '%', casas: 1 },
  muscleMassKg: { nome: 'Massa muscular', unidade: 'kg', casas: 1 },
  leanMassKg: { nome: 'Massa magra', unidade: 'kg', casas: 1 },
  bodyWaterPercent: { nome: 'Água corporal', unidade: '%', casas: 1 },
  visceralFat: { nome: 'Gordura visceral', unidade: '', casas: 0 },
  boneMassKg: { nome: 'Massa óssea', unidade: 'kg', casas: 1 },
  bmrKcal: { nome: 'Metabolismo basal', unidade: 'kcal', casas: 0 },
  impedanceOhm: { nome: 'Impedância', unidade: 'Ω', casas: 1 },
}

/**
 * Como a tela explica de onde veio cada número.
 *
 * O texto é curto porque vai embaixo do valor, e é explícito porque a
 * diferença entre "a balança mediu" e "a balança estimou" é a diferença entre
 * um dado e um palpite.
 */
export const EXPLICACAO_DA_ORIGEM: Record<string, string> = {
  MEASURED: 'Medido pela balança',
  ESTIMATED: 'Estimado por bioimpedância',
  CALCULATED: 'Calculado pelo Synse',
  ABSENT: 'Não informado pela balança',
}

/** O que a faixa de sincronização diz, ou nada quando não há o que dizer. */
export type ResumoDaFila = { texto: string; tom: 'neutro' | 'alerta' } | null

/**
 * O recado da fila de pesagens.
 *
 * Três regras, e a terceira é a que importa:
 *
 * 1. **Nada pendente, nada na tela.** Uma faixa "tudo sincronizado" seria ruído
 *    permanente para informar o estado normal.
 * 2. **Pendente é informação tranquila.** A medição está guardada no aparelho e
 *    sobe sozinha; dizer "erro" faria a pessoa subir na balança de novo e
 *    gravar a mesma pesagem duas vezes.
 * 3. **Descartada precisa ser dita.** Quando a fila desiste — o servidor recusou
 *    as tentativas todas —, aquela pesagem não entrou e não vai entrar. Sumir
 *    em silêncio é o pior desfecho possível: a pessoa acreditaria num histórico
 *    com um buraco que ela não sabe que existe.
 */
export function resumoDaFila(estado: {
  pendentes: number
  enviando: boolean
  descartadas: number
}): ResumoDaFila {
  if (estado.descartadas > 0) {
    const plural = estado.descartadas > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.descartadas} medições não puderam ser salvas e foram descartadas. Registre o peso à mão se quiser mantê-las.`
        : 'Uma medição não pôde ser salva e foi descartada. Registre o peso à mão se quiser mantê-la.',
    }
  }

  if (estado.pendentes === 0) return null

  const plural = estado.pendentes > 1
  if (estado.enviando) {
    return {
      tom: 'neutro',
      texto: plural
        ? `Enviando ${estado.pendentes} medições que ficaram no aparelho…`
        : 'Enviando a medição que ficou no aparelho…',
    }
  }

  return {
    tom: 'neutro',
    texto: plural
      ? `${estado.pendentes} medições guardadas no aparelho. Sobem sozinhas quando houver internet.`
      : 'Uma medição guardada no aparelho. Sobe sozinha quando houver internet.',
  }
}

/**
 * ── A autorização deste aluno para quem está olhando ────────────────────────
 *
 * O painel do professor precisa distinguir três situações que, sem isto,
 * chegariam à tela como a mesma lista vazia:
 *
 * 1. o aluno não autorizou quem está olhando;
 * 2. autorizou, e ainda não pesou;
 * 3. autorizou, e há histórico.
 *
 * Confundir a 1 com a 2 é o defeito que esta função existe para impedir — o
 * professor concluiria que o aluno nunca usou a balança quando, na verdade,
 * é ele quem não tem permissão. E a 2 lida como 1 faria o professor cobrar
 * uma autorização que o aluno já deu.
 *
 * ── Isto não autoriza nada ──────────────────────────────────────────────────
 *
 * Quem decide o que o professor lê é a RLS: `body_measurements_self` (0032)
 * exige `body_shared_with_me(user_profile_id)`, e sem autorização a consulta
 * devolve zero linhas, qualquer coisa que esta função responda. O que está
 * aqui é a frase certa para a tela, não o portão.
 */
export function autorizacaoDoAluno(
  autorizacoes: BodyMeasurementShare[],
  alunoProfileId: string,
  meuProfileId: string,
): BodyMeasurementShare | null {
  return (
    autorizacoes.find(
      (a) =>
        a.userProfileId === alunoProfileId &&
        a.sharedWithProfileId === meuProfileId &&
        a.revokedAt === null,
    ) ?? null
  )
}
