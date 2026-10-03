import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApagarPrograma } from '@/features/programs/apagar-programa'
import { ProgramForm } from '@/features/programs/program-form'
import { StepForm } from '@/features/programs/step-form'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Editar programa' }

/**
 * ── Montar os dias ──────────────────────────────────────────────────────────
 *
 * Um formulário por vez, com o próximo dia já preenchido, e a lista do que já
 * foi gravado ao lado. Noventa dias é muito para digitar, e a tela precisa
 * deixar claro **onde parou** — por isso o contador de dias faltando no topo,
 * que é a única informação que responde "quanto falta".
 */
export default async function EditarProgramaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession()
  const { id } = await params

  const dataSource = await getDataSource()
  const dados = await dataSource.getProgram(id)
  if (!dados) notFound()

  const { programa, passos } = dados
  const gravados = new Set(passos.map((p) => p.dayNumber))

  /*
   * O menor dia que ainda não existe, e não "o último mais um": quem gravou
   * 1, 2 e 5 está devendo o 3, e o formulário tem que abrir nele.
   */
  const proximoDia =
    Array.from({ length: programa.durationDays }, (_, i) => i + 1).find((d) => !gravados.has(d)) ??
    programa.durationDays

  const faltando = programa.durationDays - gravados.size

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <BackLink href="/synse-admin/programas" label="Programas" />
        <PageHeader
          eyebrow="Plataforma"
          title={programa.title}
          description={`${programa.code} · ${programa.durationDays} dias`}
        />
      </div>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-synse-text">
            <strong className="font-semibold">{gravados.size}</strong> de {programa.durationDays}{' '}
            dias montados
          </p>
          {faltando > 0 ? (
            <Badge variant="warning">
              Faltam {faltando} {faltando === 1 ? 'dia' : 'dias'}
            </Badge>
          ) : (
            <Badge variant="success">Completo</Badge>
          )}
        </div>
        {faltando > 0 && (
          /*
           * O aluno percorre de 1 até `duration_days`. Programa publicado com
           * buraco no meio abre uma tela com um dia faltando e nenhuma
           * explicação — por isso o aviso é aqui, antes de alguém divulgar.
           */
          <p className="mt-2 text-xs text-synse-muted">
            O aluno vê os dias de 1 a {programa.durationDays}. Enquanto faltar algum, o programa
            abre com buraco no meio.
          </p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Dia {proximoDia}</CardTitle>
        </CardHeader>
        <CardContent>
          <StepForm programId={programa.id} proximoDia={proximoDia} />
        </CardContent>
      </Card>

      {passos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dias montados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-synse-border">
              {passos.map((passo) => (
                <li key={passo.id} className="py-3">
                  <p className="text-sm font-medium text-synse-text">
                    Dia {passo.dayNumber} · {passo.title}
                  </p>
                  {passo.tasks.length > 0 && (
                    <p className="mt-0.5 text-xs text-synse-muted">{passo.tasks.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dados do programa</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgramForm programa={programa} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apagar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            O aviso diz o que a cascata da 0003 faz, e não um "não há como
            desfazer" genérico: o que some não é só o trabalho de quem está
            nesta tela.
          */}
          <p className="text-sm text-synse-muted">
            Apagar tira o programa de toda a base, na hora. Os {programa.durationDays} dias somem, e
            o progresso de quem estiver fazendo some junto.
          </p>
          <ApagarPrograma programId={programa.id} dias={programa.durationDays} />
        </CardContent>
      </Card>
    </div>
  )
}
