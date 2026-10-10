import type { NutritionPlan } from '@/types/domain'

/** Estado das server actions de nutrição. Fora do arquivo `'use server'`. */
export type NutritionActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  planId?: string
}

export const initialNutritionState: NutritionActionState = { status: 'idle' }

/**
 * ── O que o aluno segue, o que está sendo escrito, e o que já foi ──────────
 *
 * `listNutritionPlansForStudent` existia no data source desde a 0030 e
 * **nenhuma tela a chamava**: a aba "Nutrição" da ficha era um aviso fixo —
 * "Nenhum plano nutricional publicado" — que nunca consultava nada. Dizia
 * isso para o aluno que tinha três versões prescritas.
 *
 * ── Por que separar em três ────────────────────────────────────────────────
 *
 * A lista crua não serve: numa consulta, "o que ele segue hoje" e "o que eu
 * prescrevi em março" são perguntas diferentes, e a segunda só é feita depois
 * da primeira. Misturar as versões arquivadas com a vigente faz o
 * nutricionista precisar ler o selo de cada linha para achar a atual.
 *
 * `publishNutritionPlan` (0030) arquiva a anterior ao publicar a nova, então
 * o normal é **uma** publicada. Se houver duas — banco mexido à mão, migration
 * aplicada pela metade —, vence a de maior versão, e a outra desce para o
 * histórico em vez de sumir da tela.
 *
 * A ordem dentro de `anteriores` é desta função, e não da consulta: a
 * separação já desmonta a ordem que veio, então deixar o resto "como chegou"
 * seria depender de um detalhe de outra camada.
 */
export function dietasDoAluno(planos: NutritionPlan[]): {
  vigente: NutritionPlan | null
  rascunho: NutritionPlan | null
  anteriores: NutritionPlan[]
} {
  const porVersao = (a: NutritionPlan, b: NutritionPlan) => b.version - a.version

  const vigente = planos.filter((p) => p.status === 'PUBLISHED').sort(porVersao)[0] ?? null
  const rascunho = planos.filter((p) => p.status === 'DRAFT').sort(porVersao)[0] ?? null

  const anteriores = planos
    .filter((p) => p.id !== vigente?.id && p.id !== rascunho?.id)
    .sort(porVersao)

  return { vigente, rascunho, anteriores }
}
