import { Lock, Scale } from 'lucide-react'

import { ChartCard } from '@/components/synse/chart-card'
import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { EmptyState } from '@/components/synse/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MeasurementField } from '@/features/synse-body/components/measurement-field'
import { formatDate } from '@/lib/utils'
import type { BodySeriesPoint } from '@/features/synse-body/baldes-da-serie'
import type { BodyMeasurement, BodyMeasurementShare } from '@/types/domain'

/**
 * ── As pesagens do aluno, no painel ─────────────────────────────────────────
 *
 * A 0032 criou a autorização nominal, a 0045 deu ao aluno a tela para
 * concedê-la, e `listSharedBodyMeasurements` estava no data source desde o
 * começo — **sem nenhum chamador**. O aluno autorizava o professor, a tela
 * dizia "autorizado", e do outro lado não aparecia nada. Metade de um recurso
 * é pior que nenhum: a parte que apareceu promete a que não existe.
 *
 * ── Isto não é a avaliação física ───────────────────────────────────────────
 *
 * Fica junto dela na mesma aba porque as duas falam de composição corporal ao
 * longo do tempo, mas a procedência é outra e o cartão diz isso: a avaliação é
 * do professor, com adipômetro; isto é a balança do aluno, na casa dele. O
 * `MeasurementField` carrega a origem de cada número — medido, estimado por
 * bioimpedância ou calculado — e aqui ela importa ainda mais que na tela do
 * aluno, porque é sobre estes números que alguém vai prescrever.
 *
 * ── Os três estados ─────────────────────────────────────────────────────────
 *
 * Sem autorização, autorizado e vazio, autorizado com histórico. A diferença
 * entre os dois primeiros é o ponto do componente: a consulta devolve lista
 * vazia nos dois casos, e tratá-los igual faria o professor concluir que o
 * aluno nunca pesou quando é ele quem não pode ver.
 *
 * A frase de "sem autorização" **não diz se existe histórico**. Dizer "há 14
 * pesagens que você não pode ver" já seria contar parte do que a autorização
 * guarda.
 */

const CAMPOS = ['bodyFatPercent', 'muscleMassKg', 'leanMassKg', 'bmi'] as const

export function PesagensDoAluno({
  nome,
  autorizacao,
  medicoes,
  total,
  serie: pontos,
}: {
  nome: string
  autorizacao: BodyMeasurementShare | null
  /** As mais recentes, não todas: a ficha lista uma página. */
  medicoes: BodyMeasurement[]
  /** Quantas existem na janela. É o que impede a tabela de parecer o fim. */
  total: number
  /** O gráfico, agrupado pelo banco (0052) — um ponto por semana no ano. */
  serie: BodySeriesPoint[]
}) {
  const primeiroNome = nome.split(' ')[0]

  if (!autorizacao) {
    return (
      <EmptyState
        icon={Lock}
        title="Pesagens não compartilhadas"
        description={`${primeiroNome} não autorizou você a ver as pesagens da balança. Quem concede é o aluno, no app: Synse Body → Quem vê.`}
      />
    )
  }

  const ultima = medicoes[0]
  const anterior = medicoes[1]
  const variacao = ultima && anterior ? ultima.weightKg - anterior.weightKg : null

  const serie = pontos.map((p) => ({ label: formatDate(p.instante), value: p.pesoKg }))
  const pesagensNoGrafico = pontos.reduce((soma, p) => soma + p.medicoes, 0)

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-synse-text">Pesagens do aluno</h3>
        <p className="text-xs text-synse-muted">
          {/*
            "compartilhada com você", e não "compartilhado por ele": o produto
            não pergunta o gênero de ninguém, e deduzi-lo pelo nome erra com
            quem já é errado o bastante em formulário.
          */}
          Da balança de {primeiroNome}, compartilhada com você desde{' '}
          {formatDate(autorizacao.grantedAt)}. Pode ser revogada a qualquer momento.
        </p>
      </div>

      {medicoes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Nenhuma pesagem no período"
          description={`${primeiroNome} autorizou o compartilhamento, e ainda não registrou peso no último ano.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MeasurementField
              campo="weightKg"
              valor={ultima.weightKg}
              origem={ultima.fieldOrigin.weightKg}
              destaque
            />
            {CAMPOS.map((campo) => (
              <MeasurementField
                key={campo}
                campo={campo}
                valor={ultima[campo]}
                origem={ultima.fieldOrigin[campo]}
              />
            ))}
          </div>

          <p className="text-sm text-synse-muted">
            Última em {formatDate(ultima.measuredAt)}
            {variacao !== null &&
              (variacao === 0
                ? ' · mesmo peso da anterior'
                : ` · ${variacao > 0 ? '+' : ''}${variacao.toFixed(1)} kg desde a anterior`)}
            .
          </p>

          {serie.length > 1 && (
            <ChartCard
              title="Peso pela balança"
              description={
                pesagensNoGrafico > serie.length
                  ? `${pesagensNoGrafico} pesagens, resumidas em ${serie.length} pontos`
                  : `${pesagensNoGrafico} ${pesagensNoGrafico === 1 ? 'pesagem' : 'pesagens'}`
              }
            >
              <ProgressLineChart data={serie} unit=" kg" />
            </ChartCard>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Histórico da balança</CardTitle>
              {total > medicoes.length && (
                <p className="text-xs text-synse-muted">
                  As {medicoes.length} mais recentes de {total} no último ano.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="synse-scroll overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Pesagens compartilhadas pelo aluno</caption>
                  <thead>
                    <tr className="border-b border-synse-border text-left text-xs uppercase tracking-wide text-synse-muted">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Data
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Peso
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Gordura
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Massa muscular
                      </th>
                      <th scope="col" className="py-2 font-semibold">
                        Origem
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicoes.map((m) => (
                      <tr
                        key={m.id ?? m.clientId}
                        className="border-b border-synse-border/60 last:border-0"
                      >
                        <td className="py-2 pr-4 text-synse-muted">{formatDate(m.measuredAt)}</td>
                        <td className="py-2 pr-4 tabular-nums text-synse-text">
                          {m.weightKg.toFixed(1)} kg
                        </td>
                        <td className="py-2 pr-4 tabular-nums text-synse-muted">
                          {m.bodyFatPercent != null ? `${m.bodyFatPercent.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 pr-4 tabular-nums text-synse-muted">
                          {m.muscleMassKg != null ? `${m.muscleMassKg.toFixed(1)} kg` : '—'}
                        </td>
                        <td className="py-2 text-synse-muted">
                          {m.source === 'MANUAL' ? 'digitado' : 'balança'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
