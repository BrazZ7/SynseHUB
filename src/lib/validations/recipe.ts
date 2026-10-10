import { z } from 'zod'

/**
 * ── As categorias, na ordem do dia ──────────────────────────────────────────
 *
 * A lista mora aqui e não no banco, pelo mesmo motivo que o `context` da
 * trilha (0034) é texto livre: acrescentar "ceia" não deve exigir migration,
 * nem um `alter type` que trava a tabela. O banco guarda o que recebe; quem
 * oferece o conjunto é a tela.
 *
 * O `Record` e não um array porque a tela precisa do rótulo legível, e manter
 * os dois em lugares diferentes é como o `TIPOS` do acervo divergiu uma vez.
 *
 * ── A ordem é dado, não enfeite ─────────────────────────────────────────────
 *
 * A declaração segue o dia: café, lanche, almoço, antes e depois do treino,
 * jantar, sobremesa, bebida. O banco ordena por `category` — que é o código —,
 * e isso punha "Almoço" acima de "Café da manhã" na tela, porque `ALMOCO` vem
 * antes de `CAFE` no alfabeto. Encontrado olhando a tela, não lendo o código.
 *
 * `ordemDaCategoria` abaixo é a correção, e ela lê desta lista: a ordem de
 * declaração aqui é a ordem que aparece, e não há uma segunda lista para
 * divergir.
 */
export const CATEGORIAS = {
  CAFE: 'Café da manhã',
  LANCHE: 'Lanche',
  ALMOCO: 'Almoço',
  PRE_TREINO: 'Pré-treino',
  POS_TREINO: 'Pós-treino',
  JANTAR: 'Jantar',
  SOBREMESA: 'Sobremesa',
  BEBIDA: 'Bebida',
} as const

export type Categoria = keyof typeof CATEGORIAS

export const CATEGORIAS_LISTA = Object.keys(CATEGORIAS) as Categoria[]

/**
 * Onde esta categoria entra no dia.
 *
 * Categoria que não está na lista — vinda de um `insert` colado à mão, que o
 * banco aceita de propósito — vai para o fim, em vez de para o começo: um
 * `indexOf` que devolve -1 jogaria o desconhecido acima do café da manhã.
 */
export function ordemDaCategoria(categoria: string): number {
  const posicao = CATEGORIAS_LISTA.indexOf(categoria as Categoria)
  return posicao === -1 ? CATEGORIAS_LISTA.length : posicao
}

/**
 * ── O formulário da receita ─────────────────────────────────────────────────
 *
 * `id` é identificador, não UUID — mesma lição de `validations/program.ts` e
 * do acervo: em demonstração os ids são legíveis (`rec_frango`), e um `uuid()`
 * aqui quebraria a edição inteira com um "Invalid uuid" que não diz nada a
 * quem clicou em "Editar".
 */
export const saveRecipeSchema = z.object({
  id: z.string().trim().max(64).optional().default(''),
  title: z.string().trim().min(3, 'Dê um título.').max(140),
  description: z.string().trim().max(600).optional().default(''),
  /*
   * A categoria é validada contra a lista, e isto não contradiz o texto livre
   * no banco: a tela não deve deixar digitar qualquer coisa, e o banco não
   * deve exigir migration para a próxima. Quem decide aqui é o produto; o
   * banco só se recusa a ficar vazio.
   */
  category: z.enum(CATEGORIAS_LISTA as [Categoria, ...Categoria[]], {
    message: 'Escolha uma categoria.',
  }),
  ingredients: z.string().max(4_000).optional().default(''),
  instructions: z.string().trim().max(8_000).optional().default(''),
  /*
   * As faixas são as mesmas da 0044, e repeti-las aqui não é duplicação
   * inútil: o banco recusa com uma exceção, e a tela precisa dizer isso no
   * campo antes de a pessoa escrever a receita inteira e perder tudo no envio.
   */
  prepMinutes: z
    .union([
      z.literal(''),
      z.coerce.number().int().min(1, 'Mínimo de 1 minuto.').max(1_440, 'Máximo de 1440 minutos.'),
    ])
    .optional()
    .default(''),
  servings: z
    .union([
      z.literal(''),
      z.coerce.number().int().min(1, 'Mínimo de 1 porção.').max(50, 'Máximo de 50 porções.'),
    ])
    .optional()
    .default(''),
  imageUrl: z
    .union([z.literal(''), z.string().url('Endereço de imagem inválido.')])
    .optional()
    .default(''),
  tags: z.string().max(400).optional().default(''),
  /*
   * Os macros são quatro campos separados, e não um JSON digitado à mão.
   *
   * `nutrition_facts` é `jsonb` livre no banco, o que é certo para guardar —
   * mas pedir JSON num formulário é pedir erro de sintaxe de quem está
   * escrevendo receita, não código.
   */
  kcal: z
    .union([z.literal(''), z.coerce.number().min(0).max(10_000)])
    .optional()
    .default(''),
  protein: z
    .union([z.literal(''), z.coerce.number().min(0).max(1_000)])
    .optional()
    .default(''),
  carbs: z
    .union([z.literal(''), z.coerce.number().min(0).max(1_000)])
    .optional()
    .default(''),
  fat: z
    .union([z.literal(''), z.coerce.number().min(0).max(1_000)])
    .optional()
    .default(''),
  visibility: z.enum(['FREE', 'SYNSE_PLUS']).default('SYNSE_PLUS'),
})

export type SaveRecipeForm = z.infer<typeof saveRecipeSchema>

/**
 * Texto com um item por linha → lista. Linha vazia não vira item.
 *
 * Mesma forma de `tarefasDoTexto` em `validations/program.ts`, e a duplicação
 * é deliberada: as duas são conversões de formulário, e juntá-las num
 * utilitário genérico faria uma mudança na receita mexer no programa.
 */
export function ingredientesDoTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
}

/** Etiquetas separadas por vírgula → lista, sem repetida e sem vazia. */
export function etiquetasDoTexto(texto: string): string[] {
  const vistas = new Set<string>()
  for (const bruta of texto.split(',')) {
    const etiqueta = bruta.trim().toLowerCase()
    if (etiqueta) vistas.add(etiqueta)
  }
  return [...vistas]
}

/**
 * Os quatro campos de macro → o `jsonb` do banco, ou nulo.
 *
 * Nulo quando nenhum dos quatro foi preenchido, e não `{}`: a tela decide
 * mostrar a tabela de macros pela existência do objeto, e um objeto vazio
 * faria aparecer um quadro sem nada dentro.
 */
export function macrosDoFormulario(input: {
  kcal: number | ''
  protein: number | ''
  carbs: number | ''
  fat: number | ''
}): Record<string, number> | null {
  const macros: Record<string, number> = {}
  if (input.kcal !== '') macros.kcal = input.kcal
  if (input.protein !== '') macros.protein = input.protein
  if (input.carbs !== '') macros.carbs = input.carbs
  if (input.fat !== '') macros.fat = input.fat
  return Object.keys(macros).length > 0 ? macros : null
}

/** Rótulo legível de cada macro, na ordem em que a tela mostra. */
export const MACROS: { chave: string; rotulo: string; unidade: string }[] = [
  { chave: 'kcal', rotulo: 'Calorias', unidade: 'kcal' },
  { chave: 'protein', rotulo: 'Proteína', unidade: 'g' },
  { chave: 'carbs', rotulo: 'Carboidrato', unidade: 'g' },
  { chave: 'fat', rotulo: 'Gordura', unidade: 'g' },
]
