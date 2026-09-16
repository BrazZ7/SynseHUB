import type { Metadata } from 'next'
import Link from 'next/link'
import { Bluetooth, Pencil, Scale, Trash2 } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { Button } from '@/components/ui/button'
import { MeasurementField } from '@/features/synse-body/components/measurement-field'
import { PeriodSelector } from '@/features/synse-body/components/period-selector'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { bodyPeriodSchema } from '@/lib/validations/body'
import { formatDate } from '@/lib/utils'
import type { BodyMeasurement, BodyPeriod } from '@/types/domain'

export const metadata: Metadata = { title: 'Synse Body' }

const CAMPOS = ['bodyFatPercent', 'muscleMassKg', 'leanMassKg', 'bodyWaterPercent', 'bmi', 'bmrKcal'] as const

export default async function SynseBodyPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  await requireStudentSession()
  const { periodo } = await searchParams
  const janela: BodyPeriod = bodyPeriodSchema.safeParse(periodo).data ?? '30d'

  const dataSource = await getDataSource()

  /*
   * Publicar não é migrar: entre o deploy e o SQL colado no Supabase, este
   * código fala com um banco que ainda não tem `body_measurements`. A tela
   * aparece vazia em vez de quebrar, e `/api/health?deep=1` é quem denuncia a
   * migration pendente.
   */
  let medicoes: BodyMeasurement[] = []
  let aparelhos: Awaited<ReturnType<typeof dataSource.listUserDevices>> = []
  let indisponivel = false

  try {
    ;[medicoes, aparelhos] = await Promise.all([
      dataSource.listBodyMeasurements(janela),
      dataSource.listUserDevices(),
    ])
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
    indisponivel = true
  }

  const ultima = medicoes[0]
  const anterior = medicoes[1]
  const variacao = ultima && anterior ? ultima.weightKg - anterior.weightKg : null

  // Do mais antigo para o mais recente: o gráfico lê da esquerda para a direita.
  const serie = [...medicoes]
    .reverse()
    .map((m) => ({ label: formatDate(m.measuredAt), value: m.weightKg }))

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app" label="Hoje" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Synse Body</h1>
        <p className="text-sm text-synse-muted">
          Seu peso e sua composição corporal, medidos pela balança e guardados por você.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={aparelhos.length ? '/app/corpo/pesar' : '/app/corpo/aparelhos'}>
            <Scale className="size-4" aria-hidden />
            {aparelhos.length ? 'Pesar agora' : 'Vincular balança'}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/app/corpo/manual">
            <Pencil className="size-4" aria-hidden />
            Digitar peso
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/app/corpo/aparelhos">
            <Bluetooth className="size-4" aria-hidden />
            Aparelhos
          </Link>
        </Button>
      </div>

      <PeriodSelector atual={janela} />

      {indisponivel ? (
        <EmptyState
          icon={Scale}
          title="Synse Body ainda não está disponível"
          description="A atualização do banco ainda não foi aplicada nesta instalação."
        />
      ) : medicoes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Nenhuma medição neste período"
          description="Vincule uma balança Bluetooth ou digite seu peso para começar o histórico."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <MeasurementField
                campo="weightKg"
                valor={ultima.weightKg}
                origem={ultima.fieldOrigin.weightKg}
                destaque
              />
            </div>
            {CAMPOS.map((campo) => (
              <MeasurementField
                key={campo}
                campo={campo}
                valor={ultima[campo]}
                origem={ultima.fieldOrigin[campo]}
              />
            ))}
          </section>

          {variacao !== null && (
            <p className="text-sm text-synse-muted">
              {variacao === 0
                ? 'Mesmo peso da medição anterior.'
                : `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)} kg desde a medição anterior.`}
            </p>
          )}

          <ChartCard title="Peso" description={`Últimas ${medicoes.length} medições`}>
            <ProgressLineChart data={serie} unit="kg" />
          </ChartCard>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-synse-text">Histórico</h2>
            <ul className="space-y-2">
              {medicoes.map((medicao) => (
                <li
                  key={medicao.id ?? medicao.clientId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-synse-border bg-synse-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums text-synse-text">
                      {medicao.weightKg.toFixed(1)} kg
                    </p>
                    <p className="text-xs text-synse-muted">
                      {formatDate(medicao.measuredAt)} ·{' '}
                      {medicao.source === 'MANUAL' ? 'digitado' : 'balança'}
                    </p>
                  </div>
                  {medicao.bodyFatPercent != null && (
                    <p className="shrink-0 text-xs text-synse-muted">
                      {medicao.bodyFatPercent.toFixed(1)}% gordura
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {/*
              Apagar uma medição é da pessoa: dado corporal que não se apaga é
              dado que prende. Fica na tela de detalhe para não virar um toque
              acidental na lista.
            */}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-synse-muted">
              <Trash2 className="size-3" aria-hidden />
              Você pode apagar qualquer medição a qualquer momento.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
