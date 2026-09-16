import { z } from 'zod'

export const TIPOS = {
  ARTICLE: 'Artigo',
  VIDEO: 'Vídeo',
  GUIDE: 'Guia',
  RECIPE: 'Receita',
  EBOOK: 'E-book',
} as const

export type TipoConteudo = keyof typeof TIPOS

/**
 * A visibilidade não é escolha da tela.
 *
 * Conteúdo de academia é sempre `ORGANIZATION`. `FREE` é da plataforma, e a
 * 0031 recusa a combinação com academia dona — oferecer a opção convidaria ao
 * erro que o rótulo já convida: "grátis" lido como "sem custo para os meus
 * alunos" publicava na internet.
 */
export const saveContentSchema = z.object({
  type: z.enum(['ARTICLE', 'VIDEO', 'GUIDE', 'RECIPE', 'EBOOK']),
  title: z.string().trim().min(3, 'Dê um título.').max(140),
  summary: z.string().trim().max(300).optional().default(''),
  body: z.string().trim().max(20_000).optional().default(''),
  coverUrl: z.union([z.literal(''), z.string().url('Endereço de capa inválido.')]).optional().default(''),
  mediaUrl: z.union([z.literal(''), z.string().url('Endereço de mídia inválido.')]).optional().default(''),
  pinned: z.coerce.boolean().default(false),
  /** Em branco mantém como rascunho; data no futuro agenda. */
  publishAt: z.union([z.literal(''), z.string().date()]).optional().default(''),
})

export type SaveContentForm = z.infer<typeof saveContentSchema>
