'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  etiquetasDoTexto,
  ingredientesDoTexto,
  macrosDoFormulario,
  saveRecipeSchema,
} from '@/lib/validations/recipe'
import type { RecipeAdminState } from '@/features/recipes/admin-state'

/**
 * ── Publicar receita ────────────────────────────────────────────────────────
 *
 * Mesmo desenho do acervo (0039) e dos programas (0043), e pelas mesmas
 * razões: três travas em série.
 *
 * 1. `requirePlatformSession` — a rota inteira é de conta de plataforma.
 * 2. `save_recipe` confere `is_super_admin()` **no banco**, porque sessão é
 *    cookie e cookie se edita.
 * 3. A função só alcança `recipes`, que não tem dono: esta porta nunca serve
 *    de atalho para mexer no conteúdo de uma academia.
 *
 * A trilha em `platform_access_log` é escrita pela função, não daqui.
 */

function paraNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

/** `''` do formulário vira `null`; número vira número. */
function paraNumero(valor: number | ''): number | null {
  return valor === '' ? null : valor
}

export async function salvarReceitaAction(
  _state: RecipeAdminState,
  formData: FormData,
): Promise<RecipeAdminState> {
  await requirePlatformSession()

  try {
    const parsed = saveRecipeSchema.safeParse({
      id: formData.get('recipeId') ?? '',
      title: formData.get('title') ?? '',
      description: formData.get('description') ?? '',
      category: formData.get('category') ?? '',
      ingredients: formData.get('ingredients') ?? '',
      instructions: formData.get('instructions') ?? '',
      prepMinutes: formData.get('prepMinutes') ?? '',
      servings: formData.get('servings') ?? '',
      imageUrl: formData.get('imageUrl') ?? '',
      tags: formData.get('tags') ?? '',
      kcal: formData.get('kcal') ?? '',
      protein: formData.get('protein') ?? '',
      carbs: formData.get('carbs') ?? '',
      fat: formData.get('fat') ?? '',
      visibility: formData.get('visibility') ?? 'SYNSE_PLUS',
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dados = parsed.data
    const dataSource = await getDataSource()
    const recipeId = await dataSource.saveRecipe({
      id: dados.id || undefined,
      title: dados.title,
      description: paraNulo(dados.description),
      category: dados.category,
      ingredients: ingredientesDoTexto(dados.ingredients),
      instructions: paraNulo(dados.instructions),
      prepMinutes: paraNumero(dados.prepMinutes),
      servings: paraNumero(dados.servings),
      imageUrl: paraNulo(dados.imageUrl),
      tags: etiquetasDoTexto(dados.tags),
      nutritionFacts: macrosDoFormulario(dados),
      visibility: dados.visibility,
    })

    logger.info('receita:salva', { recipeId, visibility: dados.visibility })
    revalidatePath('/synse-admin/receitas')
    revalidatePath(`/synse-admin/receitas/${recipeId}`)
    revalidatePath('/app/nutrition/receitas')

    return { status: 'success', recipeId, message: 'Receita salva.' }
  } catch (erro) {
    if (!(erro instanceof AppError)) logger.error('receita:falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}

export async function apagarReceitaAction(
  _state: RecipeAdminState,
  formData: FormData,
): Promise<RecipeAdminState> {
  await requirePlatformSession()

  try {
    const recipeId = String(formData.get('recipeId') ?? '')
    if (!recipeId) return { status: 'error', message: 'Receita inválida.' }

    const dataSource = await getDataSource()
    await dataSource.deleteRecipe(recipeId)

    logger.info('receita:apagada', { recipeId })
    revalidatePath('/synse-admin/receitas')
    revalidatePath('/app/nutrition/receitas')

    return { status: 'success', message: 'Receita apagada.' }
  } catch (erro) {
    if (!(erro instanceof AppError)) logger.error('receita:apagar_falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}
