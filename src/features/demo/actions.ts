'use server'

import { revalidatePath } from 'next/cache'

import { clearDemoJournal } from '@/lib/database/demo-journal'
import { isDemoMode } from '@/lib/database/env'

/**
 * Devolve a demonstração ao estado inicial.
 *
 * Apaga o diário do visitante; o dataset base é determinístico e volta
 * sozinho. Não faz nada quando existe um banco conectado.
 */
export async function resetDemoAction() {
  if (!isDemoMode()) return
  await clearDemoJournal()
  revalidatePath('/', 'layout')
}
