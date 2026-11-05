import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WORKOUT_PREFERENCES } from '@/types/domain'
import { workoutPreferencesSchema } from '@/lib/validations/workout'

/**
 * ── Os ajustes do treino, agora com porta ───────────────────────────────────
 *
 * `workout_preferences` existe desde a 0026, com RLS, e `saveWorkoutPreferences`
 * no data source desde então. Nenhuma tela chamava a action: o aluno não tinha
 * onde desligar a vibração. Esta rodada ligou o painel — e ligar significa que
 * um objeto vindo do cliente passou a chegar na action.
 *
 * O que estes testes protegem:
 *
 * 1. **Nada malformado atravessa.** A action valida antes de tocar no banco, e
 *    o data source nem é procurado quando a entrada é lixo.
 * 2. **O dono sai da sessão, nunca do argumento.** É a regra que impede uma
 *    chamada direta de gravar preferência no perfil alheio — e, acima dela, a
 *    `workout_preferences_self` da 0026 confere de novo.
 * 3. **O teto do descanso é o mesmo nos dois lugares.** O esquema diz 900 e o
 *    `check` da migration diz 900; separados, o Postgres recusaria com erro de
 *    banco o que a tela deixou passar.
 */

const dataSource = {
  saveWorkoutPreferences: vi.fn(async () => {}),
}

vi.mock('@/lib/auth/require-session', () => ({
  requireStudentSession: async () => ({
    organizationId: 'org-1',
    studentId: 'aluno-1',
    userProfileId: 'perfil-da-sessao',
  }),
}))

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))

const { saveWorkoutPreferencesAction } = await import('@/features/active-workout/actions')

beforeEach(() => {
  dataSource.saveWorkoutPreferences.mockClear()
})

describe('o esquema das preferências', () => {
  it('aceita o padrão do produto', () => {
    expect(workoutPreferencesSchema.safeParse(DEFAULT_WORKOUT_PREFERENCES).success).toBe(true)
  })

  it('cobre todos os campos que o domínio declara', () => {
    /*
     * Um campo novo em `WorkoutPreferences` sem entrada no esquema seria
     * descartado em silêncio pelo `safeParse` — a preferência apareceria na
     * tela, viajaria até a action e nunca chegaria ao banco.
     */
    expect(Object.keys(workoutPreferencesSchema.shape).sort()).toEqual(
      Object.keys(DEFAULT_WORKOUT_PREFERENCES).sort(),
    )
  })

  it('recusa booleano que não é booleano', () => {
    for (const campo of ['autoRest', 'sound', 'vibration', 'autoAdvance', 'keepScreenAwake']) {
      const r = workoutPreferencesSchema.safeParse({
        ...DEFAULT_WORKOUT_PREFERENCES,
        [campo]: 'sim',
      })
      expect(r.success, `${campo} aceitou texto`).toBe(false)
    }
  })

  it('recusa descanso negativo, quebrado ou acima do teto', () => {
    for (const valor of [-1, 1.5, 901, Number.NaN, 'muito']) {
      const r = workoutPreferencesSchema.safeParse({
        ...DEFAULT_WORKOUT_PREFERENCES,
        defaultRestSeconds: valor,
      })
      expect(r.success, `aceitou ${String(valor)}`).toBe(false)
    }
  })

  it('o teto é o mesmo `check` da 0026', () => {
    const migration = readFileSync(
      join(process.cwd(), 'src/db/migrations/0026_treino_ativo.sql'),
      'utf8',
    )
    const limites = /check \(default_rest_seconds between (\d+) and (\d+)\)/.exec(migration)
    expect(limites, 'o check mudou de forma — confira a 0026').not.toBeNull()

    const [, piso, teto] = limites!
    expect(
      workoutPreferencesSchema.safeParse({
        ...DEFAULT_WORKOUT_PREFERENCES,
        defaultRestSeconds: Number(teto),
      }).success,
    ).toBe(true)
    expect(
      workoutPreferencesSchema.safeParse({
        ...DEFAULT_WORKOUT_PREFERENCES,
        defaultRestSeconds: Number(teto) + 1,
      }).success,
    ).toBe(false)
    expect(
      workoutPreferencesSchema.safeParse({
        ...DEFAULT_WORKOUT_PREFERENCES,
        defaultRestSeconds: Number(piso) - 1,
      }).success,
    ).toBe(false)
  })
})

describe('a action que guarda as preferências', () => {
  it('guarda o que é válido, com o perfil da sessão', async () => {
    const escolha = { ...DEFAULT_WORKOUT_PREFERENCES, vibration: false, autoAdvance: true }
    const r = await saveWorkoutPreferencesAction(escolha)

    expect(r).toEqual({ ok: true })
    expect(dataSource.saveWorkoutPreferences).toHaveBeenCalledWith('perfil-da-sessao', escolha)
  })

  it('recusa entrada malformada sem procurar o banco', async () => {
    const r = await saveWorkoutPreferencesAction({
      ...DEFAULT_WORKOUT_PREFERENCES,
      defaultRestSeconds: 86_400,
    })

    expect(r.ok).toBe(false)
    expect(dataSource.saveWorkoutPreferences).not.toHaveBeenCalled()
  })

  it('a mensagem de recusa não carrega detalhe técnico', async () => {
    // O detalhe do zod fica na `message` do erro, que só o log do servidor vê.
    const r = await saveWorkoutPreferencesAction({
      ...DEFAULT_WORKOUT_PREFERENCES,
      sound: 'alto' as unknown as boolean,
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).not.toMatch(/sound|boolean|zod/i)
  })

  it('campo a mais no objeto do cliente não chega ao banco', async () => {
    /*
     * `user_profile_id` é o que importa: a tabela tem essa coluna, e um
     * `upsert` que recebesse o campo do cliente gravaria no perfil escolhido
     * por ele. O `safeParse` do zod devolve só as chaves declaradas.
     */
    await saveWorkoutPreferencesAction({
      ...DEFAULT_WORKOUT_PREFERENCES,
      user_profile_id: 'perfil-de-outra-pessoa',
    } as unknown as typeof DEFAULT_WORKOUT_PREFERENCES)

    const [dono, gravado] = dataSource.saveWorkoutPreferences.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]
    /*
     * As duas asserções: o campo colado não viaja no objeto, **e** o dono
     * continua sendo o da sessão. A segunda é a que importa — sem ela o teste
     * passava mesmo com a action lendo `user_profile_id` do argumento, que é
     * exatamente o ataque. Descoberto mutando a action, não lendo o teste.
     */
    expect(dono).toBe('perfil-da-sessao')
    expect(gravado).not.toHaveProperty('user_profile_id')
  })
})
