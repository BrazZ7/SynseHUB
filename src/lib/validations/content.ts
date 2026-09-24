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

/**
 * ── O acervo Synse ──────────────────────────────────────────────────────────
 *
 * Quase o mesmo formulário do conteúdo de academia, com uma diferença que é
 * toda a razão de existir um schema próprio: aqui a **visibilidade é escolha**,
 * e é ela que separa o acervo aberto do que só o assinante vê.
 *
 * No conteúdo de academia a visibilidade não é oferecida de propósito — "grátis"
 * lido como "sem custo para os meus alunos" já publicou na internet o que era
 * para ficar dentro. Aqui a pessoa que escolhe é a própria plataforma, e a
 * escolha errada custa o contrário: dar de graça o que sustenta a assinatura.
 * Por isso o padrão é `SYNSE_PLUS` — errar para o lado de trancar é reversível
 * em um clique; errar para o lado de abrir não desfaz quem já baixou.
 */
export const saveSynseContentSchema = z.object({
  id: z.union([z.literal(''), z.string().uuid()]).optional().default(''),
  type: z.enum(['ARTICLE', 'VIDEO', 'GUIDE', 'RECIPE', 'EBOOK']),
  title: z.string().trim().min(3, 'Dê um título.').max(140),
  summary: z.string().trim().max(300).optional().default(''),
  body: z.string().trim().max(20_000).optional().default(''),
  coverUrl: z.union([z.literal(''), z.string().url('Endereço de capa inválido.')]).optional().default(''),
  mediaUrl: z.union([z.literal(''), z.string().url('Endereço de mídia inválido.')]).optional().default(''),
  visibility: z.enum(['FREE', 'SYNSE_PLUS']).default('SYNSE_PLUS'),
  pinned: z.coerce.boolean().default(false),
  /** Em branco mantém como rascunho; data no futuro agenda. */
  publishAt: z.union([z.literal(''), z.string().date()]).optional().default(''),
})

export type SaveSynseContentForm = z.infer<typeof saveSynseContentSchema>
