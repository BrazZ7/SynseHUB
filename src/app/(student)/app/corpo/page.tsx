import type { Metadata } from 'next'
import Link from 'next/link'
import { Bluetooth, Lock, Pencil, Scale, ShieldCheck, Trash2 } from 'lucide-react'

import { ApagarMedicao } from '@/features/synse-body/apagar-medicao'
import { BackLink } from '@/components/synse/back-link'
import { Pagination } from '@/components/synse/pagination'
import { estadoDaPaginacao } from '@/components/synse/pagination-state'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { Button } from '@/components/ui/button'
import { MeasurementField } from '@/features/synse-body/components/measurement-field'
import { PendingBodySync } from '@/features/synse-body/components/pending-body-sync'
import { PeriodSelector } from '@/features/synse-body/components/period-selector'
import { PERIODOS } from '@/features/synse-body/state'
import { janelaBloqueada } from '@/lib/plans/history'
import { HISTORY_MONTHS } from '@/lib/plans/tiers'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { bodyPeriodSchema } from '@/lib/validations/body'
import { formatDate } from '@/lib/utils'
import type { BodySeriesPoint } from '@/features/synse-body/baldes-da-serie'
import type { Paginated } from '@/lib/database/data-source'
import type { BodyMeasurement, BodyPeriod } from '@/types/domain'

/** A maior janela que o plano gratuito cobre. */
const PERIODO_DO_GRATUITO: BodyPeriod = '3m'

export const metadata: Metadata = { title: 'Synse Body' }

const CAMPOS = [
  'bodyFatPercent',
  'muscleMassKg',
  'leanMassKg',
  'bodyWaterPercent',
  'bmi',
  'bmrKcal',
] as const

/** Quantas pesagens o histórico mostra por página. */
const POR_PAGINA = 30

export default async function SynseBodyPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; page?: string }>
}) {
  const session = await requireStudentSession()
  const { periodo, page } = await searchParams
  const pagina = Math.max(1, Number(page ?? 1) || 1)
  const pedida: BodyPeriod = bodyPeriodSchema.safeParse(periodo).data ?? '30d'

  /*
   * O recorte é aqui, no servidor, e não no seletor.
   *
   * O seletor esconde a opção que o plano não cobre; forjar `?periodo=tudo` na
   * barra de endereços passaria por cima dele. A regra da casa é que o
   * front-end usa o plano só para esconder UI — quem recusa é a leitura.
   */
  const diasPedidos = PERIODOS.find((opcao) => opcao.valor === pedida)?.dias ?? 30
  const recortado = janelaBloqueada(session.tier, diasPedidos)
  const janela: BodyPeriod = recortado ? PERIODO_DO_GRATUITO : pedida

  const dataSource = await getDataSource()

  /*
   * Publicar não é migrar: entre o deploy e o SQL colado no Supabase, este
   * código fala com um banco que ainda não tem `body_measurements`. A tela
   * aparece vazia em vez de quebrar, e `/api/health?deep=1` é quem denuncia a
   * migration pendente.
   */
  let historico: Paginated<BodyMeasurement> = { rows: [], total: 0, page: 1, pageSize: POR_PAGINA }
  let pontos: BodySeriesPoint[] = []
  let aparelhos: Awaited<ReturnType<typeof dataSource.listUserDevices>> = []
  let indisponivel = false

  try {
    ;[historico, pontos, aparelhos] = await Promise.all([
      dataSource.listBodyMeasurements(janela, { page: pagina, pageSize: POR_PAGINA }),
      /*
       * O gráfico vem agrupado pelo banco (0052) e **não** da lista: lista tem
       * página, gráfico não. Antes os dois saíam da mesma leitura sem teto, e
       * o corte silencioso do PostgREST — que descarta o mais antigo — fazia a
       * linha nascer no meio do caminho sem nada dizer que faltava começo.
       */
      dataSource.getBodySeries(janela),
      dataSource.listUserDevices(),
    ])
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
    indisponivel = true
  }

  const medicoes = historico.rows
  const ultima = medicoes[0]
  const anterior = medicoes[1]
  const variacao = ultima && anterior ? ultima.weightKg - anterior.weightKg : null

  // Do mais antigo para o mais recente: o gráfico lê da esquerda para a direita.
  const serie = pontos.map((p) => ({ label: formatDate(p.instante), value: p.pesoKg }))
  const paginacao = estadoDaPaginacao(pagina, POR_PAGINA, historico.total)

  /*
   * O resumo do gráfico conta pesagens, não pontos: um ponto pode agrupar as
   * três do mesmo dia, e dizer "7 pontos" para quem pesou 21 vezes seria
   * trocar um número honesto por um detalhe de implementação.
   */
  const pesagensNoGrafico = pontos.reduce((soma, p) => soma + p.medicoes, 0)

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
        {/*
          A porta do controle de privacidade. A 0032 criou a autorização
          nominal e revogável; a tela que a opera só chegou agora, e sem este
          elo ela continuaria existindo sem ninguém alcançar.
        */}
        <Button asChild size="sm" variant="ghost">
          <Link href="/app/corpo/compartilhamento">
            <ShieldCheck className="size-4" aria-hidden />
            Quem vê
          </Link>
        </Button>
      </div>

      {/*
        As pesagens feitas sem rede. Só aparece quando há o que dizer, e é ele
        que efetivamente sobe a fila — não basta gravá-la.
      */}
      <PendingBodySync />

      <PeriodSelector atual={janela} tier={session.tier} />

      {recortado && (
        <Link
          href="/app/synse"
          className="flex items-start gap-2.5 rounded-xl border border-synse-border bg-synse-surface p-4 text-sm text-synse-text transition-colors hover:border-synse-primary"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            No plano gratuito o histórico volta {HISTORY_MONTHS.FREE} meses. O Synse+ abre{' '}
            {HISTORY_MONTHS.PRO / 12} anos — e nada é apagado: suas medições continuam aqui.
          </span>
        </Link>
      )}

      {indisponivel ? (
        <EmptyState
          icon={Scale}
          title="Synse Body ainda não está disponível"
          description="A atualização do banco ainda não foi aplicada nesta instalação."
        />
      ) : medicoes.length === 0 ? (
        /*
          Vazio por página inexistente não é vazio por nunca ter pesado: quem
          digitou `?page=9` numa lista de duas páginas não precisa de convite
          para vincular balança. O total e o botão de voltar ficam com a barra.
        */
        paginacao.tipo === 'fora_da_faixa' ? (
          <EmptyState icon={Scale} title="Esta página do histórico não existe mais" />
        ) : (
          <EmptyState
            icon={Scale}
            title="Nenhuma medição neste período"
            description="Vincule uma balança Bluetooth ou digite seu peso para começar o histórico."
          />
        )
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

          {serie.length > 1 && (
            <ChartCard
              title="Peso"
              description={
                pesagensNoGrafico > serie.length
                  ? `${pesagensNoGrafico} medições, resumidas em ${serie.length} pontos`
                  : `${pesagensNoGrafico} ${pesagensNoGrafico === 1 ? 'medição' : 'medições'}`
              }
            >
              <ProgressLineChart data={serie} unit="kg" />
            </ChartCard>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-synse-text">
              Histórico
              <span className="ml-2 font-normal text-synse-muted">
                {historico.total} {historico.total === 1 ? 'pesagem' : 'pesagens'}
              </span>
            </h2>
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
                  <div className="flex shrink-0 items-center gap-2">
                    {medicao.bodyFatPercent != null && (
                      <p className="text-xs text-synse-muted">
                        {medicao.bodyFatPercent.toFixed(1)}% gordura
                      </p>
                    )}
                    {/*
                      Só o que já está gravado no servidor tem id. A pesagem
                      ainda na fila offline não tem o que apagar lá, e o botão
                      prometeria algo que a action não consegue fazer.
                    */}
                    {medicao.id && (
                      <ApagarMedicao
                        measurementId={medicao.id}
                        quando={formatDate(medicao.measuredAt)}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/*
              A primeira paginação do app do aluno. Entra aqui porque pesagem
              não se apaga: quem pesa todo dia tem centenas por ano, e a lista
              inteira numa tela de celular não é histórico, é rolagem.
            */}
            <div className="mt-4">
              <Pagination page={pagina} pageSize={POR_PAGINA} total={historico.total} />
            </div>

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
