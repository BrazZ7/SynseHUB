#!/usr/bin/env node
/**
 * Popula o banco com o dataset de demonstração do SynseHub.
 *
 * Contas de demonstração: nenhuma senha é gerada por este script. Os usuários
 * são criados no Supabase Auth com `email_confirm: true` e sem senha — o acesso
 * acontece por magic link (`supabase.auth.signInWithOtp`). Assim não existe
 * credencial fixa no repositório nem no banco.
 *
 * Uso:
 *   npm run db:seed
 *
 * Lê as credenciais do `.env.local`. Variável definida no shell tem
 * precedência sobre o arquivo.
 */
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile } from './lib/env-file.mjs'

loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error(`
Faltam variáveis de ambiente.

  NEXT_PUBLIC_SUPABASE_URL   = ${url ? 'ok' : 'ausente'}
  SUPABASE_SERVICE_ROLE_KEY  = ${serviceRoleKey ? 'ok' : 'ausente'}

Defina as duas em .env.local antes de rodar o seed.
`)
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/*
 * O link de acesso só chega se o e-mail existir de verdade, e
 * `@academiaalpha.demo` é um domínio inventado. Defina SEED_OWNER_EMAIL com o
 * seu endereço para conseguir entrar como proprietário; os demais perfis
 * seguem fictícios, e passam a existir quando houver convite de equipe.
 */
const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim() || 'owner@academiaalpha.demo'

const STAFF = [
  { name: 'Emerson Braz', email: ownerEmail, role: 'OWNER' },
  { name: 'Marina Duarte', email: 'gerente@academiaalpha.demo', role: 'MANAGER' },
  { name: 'Rafael Nunes', email: 'professor1@academiaalpha.demo', role: 'TRAINER', registration: 'CREF 012345-G/SP' },
  { name: 'Carolina Prado', email: 'professor2@academiaalpha.demo', role: 'TRAINER', registration: 'CREF 023456-G/SP' },
  { name: 'Bianca Rezende', email: 'nutri@academiaalpha.demo', role: 'NUTRITIONIST', registration: 'CRN 34567' },
  { name: 'Lucas Ferraz', email: 'recepcao@academiaalpha.demo', role: 'RECEPTIONIST' },
]

const PLANS = [
  { name: 'Mensal', price: 109.9, billing_cycle: 'MONTHLY', enrollment_fee: 49.9 },
  { name: 'Trimestral', price: 94.9, billing_cycle: 'QUARTERLY', enrollment_fee: 0 },
  { name: 'Semestral', price: 84.9, billing_cycle: 'SEMIANNUAL', enrollment_fee: 0 },
  { name: 'Anual', price: 74.9, billing_cycle: 'ANNUAL', enrollment_fee: 0 },
  { name: 'Personalizado', price: 159.9, billing_cycle: 'MONTHLY', enrollment_fee: 0 },
]

const FIRST_NAMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Patrícia', 'Rafael',
  'Sofia', 'Thiago', 'Vanessa', 'Vinícius']
const LAST_NAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Gomes', 'Ribeiro', 'Almeida',
  'Carvalho', 'Fernandes']

async function main() {
  console.log('Semeando o SynseHub…\n')

  // ── Organização ────────────────────────────────────────────────────────────
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .upsert(
      {
        name: 'Academia Alpha',
        slug: 'academia-alpha',
        type: 'GYM',
        legal_name: 'Alpha Saúde e Performance LTDA',
        city: 'São Paulo',
        state: 'SP',
        hub_plan: 'PREMIUM',
        status: 'ACTIVE',
        onboarding_completed: true,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (orgError) throw orgError
  const organizationId = organization.id
  console.log(`  organização        ✓  ${organizationId}`)

  await supabase.from('organization_settings').upsert({ organization_id: organizationId })
  await supabase
    .from('organization_billing_settings')
    .upsert({ organization_id: organizationId, platform_fee_percentage: 2 })
  console.log('  configurações      ✓')

  // ── Equipe ─────────────────────────────────────────────────────────────────
  const staffIds = []
  for (const member of STAFF) {
    // Sem senha: o acesso é por magic link.
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: member.email,
      email_confirm: true,
      user_metadata: { name: member.name, demo: true },
    })
    if (authError && !authError.message.includes('already been registered')) throw authError

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        { auth_user_id: authUser?.user?.id ?? null, name: member.name, email: member.email },
        { onConflict: 'email' },
      )
      .select('id')
      .single()
    if (profileError) throw profileError

    await supabase.from('organization_members').upsert(
      { organization_id: organizationId, user_profile_id: profile.id, role: member.role },
      { onConflict: 'organization_id,user_profile_id' },
    )

    const { data: staffRow } = await supabase
      .from('staff')
      .upsert(
        {
          organization_id: organizationId,
          user_profile_id: profile.id,
          role: member.role,
          registration_number: member.registration ?? null,
        },
        { onConflict: 'organization_id,user_profile_id' },
      )
      .select('id, role')
      .single()

    if (staffRow) staffIds.push(staffRow)
  }
  console.log(`  equipe             ✓  ${staffIds.length} profissionais`)

  const trainers = staffIds.filter((row) => row.role === 'TRAINER')

  // ── Planos ─────────────────────────────────────────────────────────────────
  const planIds = []
  for (const plan of PLANS) {
    const { data, error } = await supabase
      .from('membership_plans')
      .insert({ organization_id: organizationId, ...plan, benefits: ['Musculação', 'Aulas coletivas'] })
      .select('id, price')
      .single()
    if (error) throw error
    planIds.push(data)
  }
  console.log(`  planos             ✓  ${planIds.length}`)

  // ── Alunos ─────────────────────────────────────────────────────────────────
  /*
   * Volume igual ao da demonstração: o painel só convence quem está avaliando
   * o produto se os números parecerem os de uma academia de verdade.
   *
   * Quase nenhum aluno ganha conta de autenticação. `auth.admin.createUser` não
   * aceita lote, e criar 534 contas levaria minutos — além de não refletir a
   * realidade, onde a maioria dos alunos nunca abriu o app. `auth_user_id` é
   * anulável justamente por isso.
   */
  const ACTIVE_STUDENTS = 478
  const OVERDUE_STUDENTS = 22
  const INACTIVE_STUDENTS = 34
  const TOTAL_STUDENTS = ACTIVE_STUDENTS + OVERDUE_STUDENTS + INACTIVE_STUDENTS
  const CHECKINS_TODAY = 139

  // PRNG determinístico: rodar o seed duas vezes produz a mesma academia.
  let prngState = 0x53594e53
  const random = () => {
    prngState |= 0
    prngState = (prngState + 0x6d2b79f5) | 0
    let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = (list) => list[Math.floor(random() * list.length)]

  const today = new Date()

  /** Insere em blocos: 534 alunos numa requisição só estouraria o limite. */
  async function insertMany(table, rows, { chunk = 500, select = null } = {}) {
    const out = []
    for (let start = 0; start < rows.length; start += chunk) {
      const slice = rows.slice(start, start + chunk)
      const query = supabase.from(table).insert(slice)
      const { data, error } = select ? await query.select(select) : await query
      if (error) throw new Error(`${table}: ${error.message}`)
      if (data) out.push(...data)
    }
    return out
  }

  /*
   * Limpa os alunos de execuções anteriores.
   *
   * Este trecho usa `insert`, não `upsert`: com 534 alunos e milhares de
   * cobranças, resolver conflito linha a linha custaria caro e não faz
   * sentido — o conjunto é gerado inteiro a cada vez. O padrão de e-mail
   * atinge só alunos; equipe e proprietário ficam de fora, e o resto some
   * por cascata (matrículas, cobranças, frequência, avaliações).
   */
  const { data: previous } = await supabase
    .from('user_profiles')
    .select('id')
    .like('email', 'aluno%@academiaalpha.demo')

  if (previous && previous.length > 0) {
    const ids = previous.map((row) => row.id)
    for (let start = 0; start < ids.length; start += 200) {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .in('id', ids.slice(start, start + 200))
      if (error) throw new Error(`limpeza: ${error.message}`)
    }
    console.log(`  limpeza            ✓  ${ids.length} alunos anteriores removidos`)
  }

  // Perfis
  const profileRows = []
  for (let index = 0; index < TOTAL_STUDENTS; index += 1) {
    profileRows.push({
      auth_user_id: null,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      email: `aluno${index + 1}@academiaalpha.demo`,
      phone: `11${9}${String(10000000 + index).slice(0, 8)}`,
    })
  }
  const profiles = await insertMany('user_profiles', profileRows, { select: 'id' })

  await insertMany(
    'organization_members',
    profiles.map((profile) => ({
      organization_id: organizationId,
      user_profile_id: profile.id,
      role: 'STUDENT',
    })),
  )

  // Matrículas. A situação define o que o painel mostra em cada indicador.
  const studentRows = profiles.map((profile, index) => {
    const status =
      index < OVERDUE_STUDENTS
        ? 'OVERDUE'
        : index < OVERDUE_STUDENTS + INACTIVE_STUDENTS
          ? 'INACTIVE'
          : 'ACTIVE'
    const monthsAgo = Math.floor(random() * 24)
    const enrolledAt = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1 + Math.floor(random() * 27))
    return {
      organization_id: organizationId,
      user_profile_id: profile.id,
      status,
      enrolled_at: enrolledAt.toISOString().slice(0, 10),
      cancelled_at: status === 'INACTIVE' ? new Date(today.getTime() - Math.floor(random() * 120) * 86_400_000).toISOString().slice(0, 10) : null,
      trainer_id: trainers.length > 0 ? pick(trainers).id : null,
    }
  })
  const students = await insertMany('students', studentRows, { select: 'id, status, enrolled_at' })

  // Planos: os mais baratos concentram mais gente, como numa academia real.
  const planWeights = [0.42, 0.24, 0.16, 0.12, 0.06]
  const planFor = () => {
    const roll = random()
    let acc = 0
    for (let i = 0; i < planIds.length; i += 1) {
      acc += planWeights[i] ?? 1 / planIds.length
      if (roll <= acc) return planIds[i]
    }
    return planIds[0]
  }

  const membershipRows = students.map((student) => {
    const plan = planFor()
    return {
      organization_id: organizationId,
      student_id: student.id,
      plan_id: plan.id,
      price: plan.price,
      billing_day: 1 + Math.floor(random() * 27),
      status: student.status === 'INACTIVE' ? 'CANCELLED' : 'ACTIVE',
    }
  })
  const memberships = await insertMany('memberships', membershipRows, {
    select: 'id, student_id, price, billing_day',
  })

  // Seis meses de mensalidades. Só quem está inadimplente deixa a do mês aberta.
  const overdueStudentIds = new Set(
    students.filter((student) => student.status === 'OVERDUE').map((student) => student.id),
  )
  const inactiveStudentIds = new Set(
    students.filter((student) => student.status === 'INACTIVE').map((student) => student.id),
  )

  const chargeRows = []
  for (const membership of memberships) {
    const student = students.find((item) => item.id === membership.student_id)
    const enrolledAt = new Date(student.enrolled_at)
    const isOverdue = overdueStudentIds.has(membership.student_id)
    const isInactive = inactiveStudentIds.has(membership.student_id)

    for (let offset = 5; offset >= 0; offset -= 1) {
      const competence = new Date(today.getFullYear(), today.getMonth() - offset, membership.billing_day)
      if (competence < enrolledAt) continue
      if (isInactive && offset < 2) continue // saiu: parou de ser cobrado

      const isCurrent = offset === 0
      const status = isCurrent && isOverdue ? 'OVERDUE' : 'PAID'
      chargeRows.push({
        organization_id: organizationId,
        student_id: membership.student_id,
        membership_id: membership.id,
        description: `Mensalidade ${competence.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
        amount: membership.price,
        due_date: competence.toISOString().slice(0, 10),
        status,
        paid_at: status === 'PAID' ? competence.toISOString() : null,
        payment_method: status === 'PAID' ? pick(['PIX', 'CREDIT_CARD', 'BOLETO']) : null,
        billing_reference: `${membership.id}:${competence.getFullYear()}-${competence.getMonth() + 1}`,
      })
    }
  }
  await insertMany('charges', chargeRows)

  // Frequência dos últimos 30 dias, com o total de hoje batendo com o painel.
  const activeStudents = students.filter((student) => student.status !== 'INACTIVE')
  const checkInRows = []
  for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
    const weekday = new Date(today.getTime() - daysAgo * 86_400_000).getDay()
    const base = weekday === 0 ? 0.25 : weekday === 6 ? 0.55 : 1
    const count = daysAgo === 0 ? CHECKINS_TODAY : Math.round(CHECKINS_TODAY * base * (0.85 + random() * 0.3))

    // Sorteio sem repetição: um aluno não entra duas vezes no mesmo dia. Contar
    // a tentativa em vez do acerto entregava menos check-ins que o pedido.
    const seen = new Set()
    let attempts = 0
    const target = Math.min(count, activeStudents.length)
    while (seen.size < target && attempts < target * 20) {
      attempts += 1
      const student = pick(activeStudents)
      if (seen.has(student.id)) continue
      seen.add(student.id)
      const at = new Date(today.getTime() - daysAgo * 86_400_000)
      at.setHours(6 + Math.floor(random() * 16), Math.floor(random() * 60), 0, 0)
      if (at > today) at.setHours(today.getHours() - 1)
      checkInRows.push({
        organization_id: organizationId,
        student_id: student.id,
        checked_in_at: at.toISOString(),
        method: random() < 0.8 ? 'QR_CODE' : 'MANUAL',
      })
    }
  }
  await insertMany('check_ins', checkInRows)

  console.log(`  alunos             ✓  ${TOTAL_STUDENTS} (${OVERDUE_STUDENTS} inadimplentes, ${INACTIVE_STUDENTS} inativos)`)
  console.log(`  cobranças          ✓  ${chargeRows.length}`)
  console.log(`  check-ins          ✓  ${checkInRows.length}`)

  // ── Régua de cobrança ──────────────────────────────────────────────────────
  const rules = [
    [-3, 'Sua mensalidade vence em 3 dias.'],
    [0, 'Sua mensalidade vence hoje.'],
    [3, 'Identificamos um pagamento em aberto.'],
    [7, 'Sua mensalidade está atrasada há uma semana.'],
  ]
  for (const [offset, template] of rules) {
    await supabase.from('collection_rules').upsert(
      { organization_id: organizationId, offset_days: offset, template, channels: ['PUSH', 'EMAIL'] },
      { onConflict: 'organization_id,offset_days' },
    )
  }
  console.log('  régua de cobrança  ✓')

  const fictional = STAFF.filter((member) => member.email.endsWith('@academiaalpha.demo'))

  console.log(`
Seed concluído.

As contas não têm senha. Na tela de login use "Entrar com link por e-mail".

  ${STAFF.map((member) => `  ${member.role.padEnd(13)} ${member.email}`).join('\n')}
${
  fictional.length === STAFF.length
    ? `
Atenção: nenhum desses endereços existe, então nenhum link vai chegar.
Rode de novo com o seu e-mail para conseguir entrar:

  SEED_OWNER_EMAIL=voce@exemplo.com npm run db:seed
`
    : ''
}`)
}

main().catch((error) => {
  console.error('\nFalha no seed:', error.message ?? error)
  process.exit(1)
})
