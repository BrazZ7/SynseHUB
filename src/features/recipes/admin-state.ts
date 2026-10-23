/** Estado das ações de autoria de receita. Fora do arquivo `'use server'`. */
export type RecipeAdminState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  recipeId?: string
  fieldErrors?: Record<string, string[]>
}

export const recipeAdminInicial: RecipeAdminState = { status: 'idle' }
