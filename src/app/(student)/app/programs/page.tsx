import type { Metadata } from 'next'
import { CalendarRange } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { ChamadaDoPlus } from '@/features/content/vitrine'
import { ProgramCard, ProgramaTrancado } from '@/features/programs/program-card'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { ProgramaNaLista, ProgramaTrancado as Trancado } from '@/types/domain'

export const metadata: Metadata = { title: 'Programas' }

/**
 * ── Os programas guiados ─────────────────────────────────────────────────────
 *
 * As tabelas existem desde a 0003 e nunca foram lidas. A tabela de planos
 * chegou a anunciá-los, e a 0042 do comparativo tirou a promessa porque não
 * havia nada atrás dela. Esta é a tela que faltava.
 *
 * O que dá para abrir vem primeiro; o que está trancado vem depois, pelo
 * mesmo motivo da lista de conteúdos — topar primeiro com o que não se pode
 * abrir é o que faz paywall irritar.
 */
export default async function ProgramsPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  let programas: ProgramaNaLista[] = []
  let trancados: Trancado[] = []

  try {
    ;[programas, trancados] = await Promise.all([
      dataSource.listPrograms(),
      dataSource.listLockedPrograms(),
    ])
  } catch (erro) {
    /*
     * Publicar não é migrar: entre o deploy e o SQL colado à mão, as funções
     * da 0043 não existem. A tela abre vazia em vez de quebrar.
     */
    if (!isPendingMigration(erro)) throw erro
  }

  const vazio = programas.length === 0 && trancados.length === 0

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app" label="Hoje" />
      <PageHeader
        title="Programas guiados"
        description="Uma sequência de dias para seguir, com o treino de cada um já montado."
      />

      {vazio ? (
        <EmptyState
          icon={CalendarRange}
          title="Nenhum programa publicado ainda"
          description="Quando o Synse publicar um programa, ele aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {programas.map((programa) => (
            <ProgramCard key={programa.id} programa={programa} />
          ))}
        </div>
      )}

      {trancados.length > 0 && (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-sm font-semibold text-synse-text">No Synse+</h2>
            <p className="text-xs text-synse-muted">
              Você vê do que se trata; os dias abrem com a assinatura.
            </p>
          </div>

          {trancados.map((p) => (
            <ProgramaTrancado key={p.id} titulo={p.title} dias={p.durationDays} />
          ))}

          <ChamadaDoPlus titulo="Abra os programas com o Synse+" />
        </section>
      )}
    </div>
  )
}
