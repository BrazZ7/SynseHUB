import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Ticket, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/synse/empty-state'
import { FormularioDeInscricao } from '@/features/events/formulario-de-inscricao'
import { janelaDeInscricao, vagasRestantes } from '@/features/events/state'
import { LEGAL } from '@/config/app'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { EventoPublico } from '@/types/domain'

type Params = Promise<{ slug: string }>

async function carregar(slug: string): Promise<EventoPublico | null> {
  try {
    const dataSource = await getDataSource()
    return await dataSource.getEventoPublico(slug)
  } catch (erro) {
    // Publicar não é migrar: entre o push e o SQL colado, não há tabela.
    if (!isPendingMigration(erro)) throw erro
    return null
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const evento = await carregar(slug)
  if (!evento) return { title: 'Evento' }

  /*
   * A página é anunciada por link — em grupo de corrida, em story, em
   * conversa. O que aparece na prévia do link é metade do convite.
   */
  return {
    title: evento.title,
    description:
      evento.description?.slice(0, 160) ??
      `Inscrição aberta para ${evento.title}, em ${formatDate(evento.startsAt)}.`,
    openGraph: {
      title: evento.title,
      description: evento.description ?? undefined,
      type: 'website',
    },
  }
}

export default async function EventoPublicoPage({ params }: { params: Params }) {
  const { slug } = await params
  const evento = await carregar(slug)
  if (!evento) notFound()

  const janela = janelaDeInscricao(evento, new Date())
  const restantes = vagasRestantes(evento.capacity, evento.ocupadas)
  const lotado = restantes === 0

  const motivoFechado = {
    NAO_PUBLICADO: 'As inscrições deste evento não estão abertas.',
    AINDA_NAO_ABRIU: evento.registrationOpensAt
      ? `As inscrições abrem em ${formatDate(evento.registrationOpensAt)}.`
      : 'As inscrições ainda não abriram.',
    ENCERRADA: 'As inscrições deste evento já encerraram.',
    LOTADO_SEM_FILA: 'Não há mais vagas.',
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <header className="space-y-3">
        <Badge variant="primary">Inscrição aberta pelo Synse</Badge>
        <h1 className="text-3xl font-semibold text-synse-text">{evento.title}</h1>

        <dl className="grid gap-2 text-sm text-synse-muted sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-synse-primary" aria-hidden />
            <dt className="sr-only">Quando</dt>
            <dd>{formatDate(evento.startsAt)}</dd>
          </div>
          {evento.location && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-synse-primary" aria-hidden />
              <dt className="sr-only">Onde</dt>
              <dd>{evento.location}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Ticket className="size-4 shrink-0 text-synse-primary" aria-hidden />
            <dt className="sr-only">Valor</dt>
            <dd className="font-medium text-synse-text">
              {evento.price > 0 ? formatCurrency(evento.price) : 'Gratuito'}
            </dd>
          </div>
          {restantes !== null && (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-synse-primary" aria-hidden />
              <dt className="sr-only">Vagas</dt>
              <dd>
                {/*
                  O número é informativo, e a tela não promete que ele vale no
                  instante do envio: a lotação que decide é conferida sob
                  trava no banco. Quem passar entra na fila, e a próxima tela
                  diz isso sem rodeio.
                */}
                {lotado
                  ? 'Vagas esgotadas — há fila de espera'
                  : `${restantes} ${restantes === 1 ? 'vaga restante' : 'vagas restantes'}`}
              </dd>
            </div>
          )}
        </dl>

        {evento.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-synse-text">
            {evento.description}
          </p>
        )}
      </header>

      <section
        aria-labelledby="inscricao"
        className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm"
      >
        <h2 id="inscricao" className="text-lg font-semibold text-synse-text">
          {lotado ? 'Entrar na fila de espera' : 'Fazer inscrição'}
        </h2>

        {!janela.aberta ? (
          <EmptyState
            icon={CalendarDays}
            title="Inscrições fechadas"
            description={motivoFechado[janela.motivo]}
          />
        ) : (
          <>
            {lotado && (
              <p className="mt-2 rounded-lg border border-synse-warning/50 bg-synse-warning/10 px-3 py-2 text-xs text-synse-text">
                As vagas acabaram. Dá para entrar na fila: se alguém desistir, a organização chama
                pela ordem de inscrição. Não é preciso pagar nada agora.
              </p>
            )}

            {evento.price > 0 && (
              /*
                O recado que impede a maior frustração possível nesta tela: a
                pessoa preenche tudo, envia, e espera um cartão que não existe.
                Não há provedor de pagamento conectado ao Synse — o pagamento
                é PIX, e a confirmação é a organização que dá.
              */
              <p className="mt-3 text-xs text-synse-muted">
                O pagamento é por PIX, com a chave que aparece depois da inscrição. A organização
                confirma o recebimento e a vaga fica garantida — nenhum cartão é cobrado aqui.
              </p>
            )}

            <div className="mt-4">
              <FormularioDeInscricao
                eventId={evento.id}
                categorias={evento.categorias}
                precisaDeCamiseta
                versaoDaPolitica={LEGAL.version}
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
