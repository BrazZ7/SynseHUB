/**
 * Plano alimentar base do Synse.
 *
 * Educativo, não prescritivo — e a diferença não é jurídica por acaso: plano
 * alimentar individual, no modelo do produto (0003), só existe com
 * nutricionista responsável, e `nutrition_plans.author_staff_id` é obrigatório
 * justamente para que não exista prescrição sem autor.
 *
 * O que está aqui é estrutura de refeições e exemplos de troca, sem
 * quantidades calculadas para ninguém em particular.
 */
export type BaselineMeal = {
  name: string
  time: string
  suggestion: string
  swaps: string[]
}

export const BASELINE_MEAL_PLAN: {
  name: string
  summary: string
  meals: BaselineMeal[]
  habits: string[]
  disclaimer: string
} = {
  name: 'Plano alimentar base',
  summary: 'Uma estrutura de cinco refeições, com trocas para o dia em que faltar o principal.',
  meals: [
    {
      name: 'Café da manhã',
      time: '07h',
      suggestion: 'Ovos mexidos, pão integral e uma fruta.',
      swaps: ['Tapioca com queijo branco', 'Iogurte natural com aveia e banana'],
    },
    {
      name: 'Lanche da manhã',
      time: '10h',
      suggestion: 'Fruta e um punhado de castanhas.',
      swaps: ['Iogurte natural', 'Ovo cozido'],
    },
    {
      name: 'Almoço',
      time: '13h',
      suggestion:
        'Metade do prato de salada e legumes, um quarto de proteína, um quarto de carboidrato.',
      swaps: ['Frango, arroz e feijão', 'Peixe, batata-doce e salada'],
    },
    {
      name: 'Lanche da tarde',
      time: '16h',
      suggestion: 'Iogurte com fruta, ou pão integral com ovo.',
      swaps: ['Vitamina de banana com aveia', 'Sanduíche natural'],
    },
    {
      name: 'Jantar',
      time: '20h',
      suggestion: 'Semelhante ao almoço, com porção menor de carboidrato.',
      swaps: ['Omelete com salada', 'Sopa de legumes com frango desfiado'],
    },
  ],
  habits: [
    'Água ao longo do dia, sem esperar a sede.',
    'Proteína em todas as refeições principais.',
    'Comer sentado e sem tela, quando der.',
    'Deixar a próxima refeição pronta na noite anterior.',
  ],
  disclaimer:
    'Material educativo, igual para todo mundo. Não é prescrição nutricional: plano individual só com nutricionista responsável, e sua academia pode publicar um aqui.',
}
