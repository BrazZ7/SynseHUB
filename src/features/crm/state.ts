import type { LeadEvent, LeadEventKind, LeadStage } from '@/types/domain'

/** Estado das server actions do CRM. Fora do arquivo `'use server'`. */
export type CrmActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  studentId?: string
}

export const initialCrmState: CrmActionState = { status: 'idle' }

/**
 * ── Como a linha do tempo do lead se lê ─────────────────────────────────────
 *
 * `lead_events` guarda seis tipos de acontecimento (0028), e cada um precisa
 * de uma frase diferente para a linha do tempo ser lida de relance, que é como
 * ela é usada: a recepção abre a ficha com o telefone no ouvido.
 *
 * Mudança de etapa é a que não cabe num rótulo fixo — "Novo → Contatado" diz
 * mais que "Mudança de etapa", e o motivo da perda, quando existe, é a única
 * coisa que explica a taxa de conversão depois.
 *
 * Fora do componente porque é regra de leitura, e regra de leitura se testa
 * sem navegador.
 */
export const EVENTO_ROTULOS: Record<LeadEventKind, string> = {
  CREATED: 'Cadastrado',
  STAGE_CHANGE: 'Mudou de etapa',
  CALL: 'Ligação',
  MESSAGE: 'Mensagem',
  VISIT: 'Visita',
  NOTE: 'Observação',
}

/** O título de uma linha do histórico, já com as etapas quando for o caso. */
export function tituloDoEvento(
  evento: Pick<LeadEvent, 'kind' | 'fromStage' | 'toStage'>,
  rotuloDaEtapa: (etapa: LeadStage) => string,
): string {
  if (evento.kind !== 'STAGE_CHANGE') return EVENTO_ROTULOS[evento.kind]

  const destino = evento.toStage ? rotuloDaEtapa(evento.toStage) : null
  if (!destino) return EVENTO_ROTULOS.STAGE_CHANGE

  /*
   * Sem origem acontece de verdade: o gatilho da 0028 grava `from_stage` nulo
   * na criação. "→ Novo" ficaria com uma seta solta à esquerda.
   */
  return evento.fromStage
    ? `${rotuloDaEtapa(evento.fromStage)} → ${destino}`
    : `Entrou em ${destino}`
}

/**
 * Os eventos agrupados por dia, do mais recente para o mais antigo.
 *
 * Agrupar é o que transforma uma lista de carimbos numa história: três
 * tentativas de ligação na terça aparecem juntas, e o buraco de duas semanas
 * depois delas fica visível — que é exatamente a informação que faz alguém
 * pegar o telefone.
 *
 * A ordem interna de cada dia é preservada como veio (mais recente primeiro),
 * e não reordenada aqui: quem ordena é a consulta, e reordenar em dois lugares
 * é como duas listas divergem.
 */
export function eventosPorDia(eventos: LeadEvent[]): { dia: string; eventos: LeadEvent[] }[] {
  const porDia = new Map<string, LeadEvent[]>()

  for (const evento of eventos) {
    const dia = evento.createdAt.slice(0, 10)
    const lista = porDia.get(dia)
    if (lista) lista.push(evento)
    else porDia.set(dia, [evento])
  }

  return [...porDia.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, eventos]) => ({ dia, eventos }))
}

/**
 * ── O passo seguinte de cada etapa ──────────────────────────────────────────
 *
 * Aqui, e não no `lead-actions.tsx`, por um motivo que custou uma rodada no
 * navegador: aquele arquivo é `'use client'`, e **o que um componente de
 * servidor importa de um módulo cliente vira referência, não valor**. A ficha
 * lia `PROXIMA[lead.stage]`, recebia `undefined` para toda etapa, e o botão
 * "Mover para Contatado" simplesmente não aparecia — sem erro no console, sem
 * nada no log. Compilou, passou nos testes, e a tela estava errada.
 *
 * É a mesma regra que `state.ts` já cumpria para `'use server'`: constante não
 * mora em arquivo com diretiva.
 *
 * Matriculado fica de fora de propósito: quem matricula é a conversão, que
 * cria aluno e mensalidade. Chegar em ENROLLED pelo botão produziria um
 * "matriculado" sem matrícula.
 */
export const PROXIMA: Partial<Record<LeadStage, LeadStage>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'TRIAL_CLASS',
  TRIAL_CLASS: 'PROPOSAL',
}
