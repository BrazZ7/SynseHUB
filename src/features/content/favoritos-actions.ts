'use server'

import { revalidatePath } from 'next/cache'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Guarda ou desguarda um conteúdo ou uma receita, e devolve como ficou.
 *
 * ── O perfil não vem do cliente ─────────────────────────────────────────────
 *
 * Quem resolve é `toggle_content_favorite`, por `auth.uid()`. Receber o perfil
 * daqui deixaria encher a lista de leitura de outra pessoa — inofensivo em
 * aparência, e ainda assim escrita em nome alheio.
 *
 * ── E a visibilidade não é conferida aqui ───────────────────────────────────
 *
 * De propósito: a função do banco é `security invoker`, então o `exists` dela
 * passa pela RLS. Repetir a regra nesta action criaria o segundo lugar para o
 * cadeado do Synse+ divergir, que é o que a 0067 existe para evitar.
 *
 * `requireSession` e não `requireStudentSession`: a equipe também lê o acervo,
 * e guardar um artigo para voltar não é privilégio de aluno.
 */
export async function alternarFavoritoAction(alvo: {
  contentId?: string
  recipeId?: string
}): Promise<{ ok: boolean; guardado?: boolean; erro?: string }> {
  try {
    await requireSession()
    const dataSource = await getDataSource()
    const guardado = await dataSource.toggleFavorite(alvo)

    logger.info('favorito:alternado', {
      tipo: alvo.contentId ? 'CONTEUDO' : 'RECEITA',
      guardado,
    })

    /*
     * As três telas onde o coração aparece. Sem isto, voltar para a lista
     * depois de guardar mostraria o coração vazio — o estado antigo do cache.
     */
    revalidatePath('/app/favoritos')
    revalidatePath('/app/content')
    revalidatePath('/app/nutrition/receitas')
    return { ok: true, guardado }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('favorito:falhou', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
