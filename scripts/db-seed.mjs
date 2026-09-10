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
import { readFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'

/**
 * Carrega o `.env.local`.
 *
 * Ler esse arquivo é comportamento do Next.js, não do Node — rodando por
 * `node scripts/db-seed.mjs` o ambiente chega vazio, ainda que o arquivo
 * esteja preenchido. Sem isto o seed acusava variável ausente e mandava
 * defini-la exatamente onde ela já estava.
 *
 * Parser mínimo de propósito: o projeto não depende de `dotenv`, e aqui só
 * precisamos de `CHAVE=valor`. Variável já definida no shell tem precedência,
 * que é o que permite `SEED_OWNER_EMAIL=outro@email.com npm run db:seed`.
 */
function loadEnvFile(path) {
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    // Arquivo ausente é caso normal: quem define é o shell. Qualquer outra
    // falha — permissão, disco — precisa aparecer, e não sumir num catch.
    if (error.code === 'ENOENT') return
    throw error
  }

  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue // Comentário, linha vazia ou valor solto sem chave.

    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue

    // Aspas em volta são delimitador, não parte do valor.
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/s, '$2')
  }
}

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
  const today = new Date()
  let overdueCount = 0

  for (let index = 0; index < 20; index += 1) {
    const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`
    const email = `aluno${index + 1}@academiaalpha.demo`
    const plan = planIds[index % planIds.length]
    const trainer = trainers[index % Math.max(1, trainers.length)]
    const overdue = index >= 18

    const { data: authUser } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, demo: true },
    })

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        { auth_user_id: authUser?.user?.id ?? null, name, email, phone: `1199${100000 + index}` },
        { onConflict: 'email' },
      )
      .select('id')
      .single()
    if (profileError) throw profileError

    await supabase.from('organization_members').upsert(
      { organization_id: organizationId, user_profile_id: profile.id, role: 'STUDENT' },
      { onConflict: 'organization_id,user_profile_id' },
    )

    const enrolledAt = new Date(today.getFullYear(), today.getMonth() - (index % 18), 10)

    const { data: student, error: studentError } = await supabase
      .from('students')
      .upsert(
        {
          organization_id: organizationId,
          user_profile_id: profile.id,
          status: overdue ? 'OVERDUE' : 'ACTIVE',
          enrolled_at: enrolledAt.toISOString().slice(0, 10),
          trainer_id: trainer?.id ?? null,
        },
        { onConflict: 'organization_id,user_profile_id' },
      )
      .select('id')
      .single()
    if (studentError) throw studentError

    const billingDay = 5 + (index % 20)
    const { data: membership } = await supabase
      .from('memberships')
      .insert({
        organization_id: organizationId,
        student_id: student.id,
        plan_id: plan.id,
        price: plan.price,
        billing_day: billingDay,
      })
      .select('id')
      .single()

    // 6 meses de mensalidades.
    for (let offset = 5; offset >= 0; offset -= 1) {
      const competence = new Date(today.getFullYear(), today.getMonth() - offset, billingDay)
      if (competence < enrolledAt) continue
      const isCurrent = offset === 0
      const status = isCurrent && overdue ? 'OVERDUE' : 'PAID'

      await supabase.from('charges').insert({
        organization_id: organizationId,
        student_id: student.id,
        membership_id: membership?.id ?? null,
        description: `Mensalidade ${competence.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
        amount: plan.price,
        due_date: competence.toISOString().slice(0, 10),
        status,
        paid_at: status === 'PAID' ? competence.toISOString() : null,
        payment_method: 'PIX',
        billing_reference: `${membership?.id}:${competence.getFullYear()}-${competence.getMonth() + 1}`,
      })
    }
    if (overdue) overdueCount += 1

    // Check-ins dos últimos 20 dias.
    const checkIns = []
    for (let day = 0; day < 20; day += 1) {
      if ((day + index) % 3 !== 0) continue
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(7 + ((day + index) % 12), 15)
      checkIns.push({
        organization_id: organizationId,
        student_id: student.id,
        checked_in_at: at.toISOString(),
        method: 'QR_CODE',
      })
    }
    if (checkIns.length > 0) await supabase.from('check_ins').insert(checkIns)

    // Avaliações trimestrais.
    const height = 1.6 + (index % 30) / 100
    for (let quarter = 1; quarter >= 0; quarter -= 1) {
      const weight = 62 + (index % 30) - quarter
      await supabase.from('assessments').insert({
        organization_id: organizationId,
        student_id: student.id,
        assessed_by_staff_id: trainer?.id ?? null,
        assessed_at: new Date(today.getFullYear(), today.getMonth() - quarter * 3, 12)
          .toISOString()
          .slice(0, 10),
        weight,
        height,
        bmi: Number((weight / (height * height)).toFixed(2)),
      })
    }
  }

  console.log(`  alunos             ✓  20 (${overdueCount} inadimplentes)`)

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
