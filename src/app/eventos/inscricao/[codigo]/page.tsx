import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, CircleCheck, Clock, Copy, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ROTULO_DA_SITUACAO } from '@/features/events/state'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { formatCurrency, formatDate } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Sua inscrição',
  /*
   * A página tem nome, CPF parcial e situação de pagamento de uma pessoa.
   * Ela é alcançável por quem tem o código — e por mais ninguém, se os
   * buscadores não a indexarem.
   */
  robots: { index: false, follow: false },
}

type Params = Promise<{ codigo: string }>

/**
 * ── O comprovante de quem não tem conta ─────────────────────────────────────
 *
 * O código é a senha: dezesseis caracteres aleatórios, um por inscrição. É
 * ele que substitui o login para quem chegou pelo link da corrida, e por isso
 * a página sai do índice dos buscadores.
 *
 * O que ela mostra é o que a pessoa precisa: se está valendo, quanto é, para
 * onde mandar o PIX. O que ela **não** mostra é CPF e telefone inteiros —
 * quem abre pode ser quem recebeu o link encaminhado, e o comprovante não
 * precisa repetir o documento para confirmar a inscrição.
 */
export default async function InscricaoPage({ params }: { params: Params }) {
  const { codigo } = await params

  let inscricao = null
  try {
    const dataSource = await getDataSource()
    inscricao = await dataSource.consultarInscricao(codigo)
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }
  if (!inscricao) notFound()

  const aguardando = inscricao.status === 'PENDING_PAYMENT'
  const naFila = inscricao.status === 'WAITLIST'
  const confirmada = inscricao.status === 'CONFIRMED'

  return (
    <div className="animate-fade-in-up space-y-6">
      <header className="space-y-2">
        <Badge variant={confirmada ? 'success' : naFila ? 'default' : 'warning'}>
          {ROTULO_DA_SITUACAO[inscricao.status]}
        </Badge>
        <h1 className="text-2xl font-semibold text-synse-text">{inscricao.eventTitle}</h1>
        <p className="text-sm text-synse-muted">
          {inscricao.fullName}
          {inscricao.categoria && ` · ${inscricao.categoria}`}
        </p>
        <p className="flex items-center gap-2 text-sm text-synse-muted">
          <CalendarDays className="size-4 text-synse-primary" aria-hidden />
          {formatDate(inscricao.startsAt)}
        </p>
      </header>

      {confirmada && (
        <section className="flex items-start gap-3 rounded-2xl border border-synse-success/40 bg-synse-success/10 p-5">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-synse-success" aria-hidden />
          <div className="text-sm text-synse-text">
            <p className="font-medium">Tudo certo. Sua vaga está garantida.</p>
            <p className="mt-1 text-synse-muted">Guarde este endereço: ele é o seu comprovante.</p>
          </div>
        </section>
      )}

      {naFila && (
        <section className="flex items-start gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5">
          <Users className="mt-0.5 size-5 shrink-0 text-synse-muted" aria-hidden />
          <div className="text-sm text-synse-text">
            <p className="font-medium">Você está na fila de espera.</p>
            <p className="mt-1 text-synse-muted">
              As vagas acabaram antes da sua inscrição. Se alguém desistir, a organização chama
              pela ordem de chegada — e só então há pagamento. Nada é cobrado enquanto você estiver
              na fila.
            </p>
          </div>
        </section>
      )}

      {aguardando && (
        <section className="space-y-3 rounded-2xl border border-synse-warning/50 bg-synse-warning/10 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-synse-text">
            <Clock className="size-4 shrink-0" aria-hidden />
            Falta o pagamento de {formatCurrency(inscricao.amount)}
          </p>

          {inscricao.pixKey ? (
            <div className="space-y-1.5 text-sm text-synse-text">
              <p className="text-synse-muted">Chave PIX:</p>
              <p className="flex items-center gap-2 break-all font-mono text-base font-semibold">
                <Copy className="size-4 shrink-0 text-synse-muted" aria-hidden />
                <span className="select-all">{inscricao.pixKey}</span>
              </p>
              {inscricao.pixHolderName && (
                <p className="text-xs text-synse-muted">Em nome de {inscricao.pixHolderName}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-synse-muted">
              A organização vai entrar em contato com as instruções de pagamento.
            </p>
          )}

          {/*
            Dizer que a confirmação é manual, e quanto tempo leva. Sem isso a
            pessoa paga, recarrega a página, continua "aguardando" e conclui
            que o pagamento não entrou.
          */}
          <p className="text-xs text-synse-muted">
            Depois de pagar, a organização confere e confirma — pode levar algumas horas. Esta
            página passa a mostrar a confirmação sozinha; não é preciso enviar comprovante por
            aqui.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5">
        <h2 className="text-sm font-semibold text-synse-text">Seu código de inscrição</h2>
        <p className="mt-1 select-all break-all font-mono text-sm text-synse-text">{codigo}</p>
        <p className="mt-2 text-xs text-synse-muted">
          Ele é a chave desta página. Quem tiver o endereço vê a sua inscrição, então compartilhe
          só com quem precisar.
        </p>
      </section>

      <Link href="/" className="inline-block text-sm text-synse-muted underline">
        Conhecer o Synse
      </Link>
    </div>
  )
}
