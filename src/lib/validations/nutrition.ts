import { z } from 'zod'

/** Vazio vira nulo, nunca zero: item sem caloria anotada não tem zero caloria. */
const medida = (max: number) =>
  z
    .union([z.literal(''), z.coerce.number().min(0).max(max)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Number(v)))

export const saveNutritionPlanSchema = z.object({
  studentId: z.string().min(1, 'Escolha o aluno.'),
  title: z.string().trim().min(3, 'Dê um nome ao plano.').max(100),
  notes: z.string().trim().max(600).optional().default(''),
  targetCalories: medida(10_000),
  targetProteinG: medida(1000),
  targetCarbsG: medida(1000),
  targetFatG: medida(1000),

  /* Linhas paralelas, recompostas pelo índice — o mesmo formato do treino. */
  mealName: z.array(z.string()),
  mealTime: z.array(z.string()),
  /** A qual refeição cada item pertence. */
  itemMeal: z.array(z.string()),
  itemDescription: z.array(z.string()),
  itemQuantity: z.array(z.string()),
  itemCalories: z.array(z.string()),
  itemProtein: z.array(z.string()),
  itemCarbs: z.array(z.string()),
  itemFat: z.array(z.string()),
})

export type SaveNutritionPlanForm = z.infer<typeof saveNutritionPlanSchema>

const numeroOuNulo = (valor: string | undefined) => {
  if (!valor || valor.trim() === '') return null
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Recompõe refeições e itens das linhas paralelas.
 *
 * Refeição sem nome é descartada; item sem descrição também. A tela oferece
 * linhas em branco para o nutricionista preencher, e linha em branco salva
 * viraria "  " no plano do aluno.
 */
export function montarRefeicoes(dados: SaveNutritionPlanForm) {
  const refeicoes = dados.mealName
    .map((name, indice) => ({
      indice,
      name: name.trim(),
      timeOfDay: dados.mealTime[indice]?.trim() || null,
      items: [] as Array<{
        description: string
        quantity: string | null
        calories: number | null
        proteinG: number | null
        carbsG: number | null
        fatG: number | null
      }>,
    }))
    .filter((refeicao) => refeicao.name !== '')

  const porIndice = new Map(refeicoes.map((refeicao) => [String(refeicao.indice), refeicao]))

  dados.itemDescription.forEach((descricao, i) => {
    const texto = descricao.trim()
    if (texto === '') return
    const refeicao = porIndice.get(dados.itemMeal[i] ?? '')
    if (!refeicao) return

    refeicao.items.push({
      description: texto,
      quantity: dados.itemQuantity[i]?.trim() || null,
      calories: numeroOuNulo(dados.itemCalories[i]),
      proteinG: numeroOuNulo(dados.itemProtein[i]),
      carbsG: numeroOuNulo(dados.itemCarbs[i]),
      fatG: numeroOuNulo(dados.itemFat[i]),
    })
  })

  return refeicoes.map(({ name, timeOfDay, items }) => ({ name, timeOfDay, items }))
}
