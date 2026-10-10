'use client'

import { Bell, BellOff, TriangleAlert } from 'lucide-react'
import { useActionState, useCallback, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { registrarPushAction, removerPushAction } from '@/features/push/actions'
import { INICIAL_PUSH } from '@/features/push/state'

/**
 * ── Ligar o aviso neste aparelho ─────────────────────────────────────────────
 *
 * Push é a única parte do app que o servidor não consegue decidir sozinho: a
 * permissão é do navegador, a inscrição é do navegador, e os dois só existem
 * depois que a pessoa clica. Por isso este cartão é cliente inteiro.
 *
 * ── O que ele não faz ───────────────────────────────────────────────────────
 *
 * Não pede permissão ao abrir. Prompt de notificação sem contexto é o pedido
 * que todo mundo nega — e negado no navegador não se desfaz pela aplicação: a
 * pessoa teria de mexer nas configurações do site. Pede no clique, e o clique
 * é o contexto.
 */

/**
 * `sem-chave` e `sem-suporte` são causas diferentes e precisam de tratamento
 * diferente — juntá-las repetiria o defeito do "PAGAR AGORA", que respondia
 * "o provedor aceita PIX?" quando a pergunta era "dá para cobrar?".
 *
 * Sem chave é problema da instalação, e a pessoa não pode fazer nada a
 * respeito: o cartão some. Sem suporte é do navegador dela, e aí a frase
 * ajuda — no iPhone, adicionar à tela de início resolve.
 */
type Estado = 'carregando' | 'sem-chave' | 'sem-suporte' | 'negado' | 'desligado' | 'ligado'

/**
 * `applicationServerKey` quer bytes, e a chave vem em base64url.
 *
 * O `ArrayBuffer` explícito não é firula do TypeScript: o tipo de `Uint8Array`
 * admite `SharedArrayBuffer`, que a API de push recusa. Construir o buffer
 * primeiro fecha o tipo no que o navegador aceita.
 */
function paraBytes(base64url: string): ArrayBuffer {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(base64)
  const buffer = new ArrayBuffer(bruto.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i)
  return buffer
}

export function PushCard({ chavePublica }: { chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>('carregando')
  const [ligar, acaoLigar] = useActionState(registrarPushAction, INICIAL_PUSH)
  const [desligar, acaoDesligar] = useActionState(removerPushAction, INICIAL_PUSH)
  const [inscricao, setInscricao] = useState<PushSubscription | null>(null)
  /*
   * Falha da inscrição no navegador — antes do servidor entrar na história.
   * Sem isto o clique falhava em silêncio: a pessoa apertava "Ligar avisos",
   * nada acontecia, e o botão continuava lá como se ela não tivesse clicado.
   * Encontrado medindo, não lendo.
   */
  const [falhaLocal, setFalhaLocal] = useState<string | null>(null)

  const suportado =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  useEffect(() => {
    if (!chavePublica) {
      setEstado('sem-chave')
      return
    }
    if (!suportado) {
      setEstado('sem-suporte')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('negado')
      return
    }

    let vivo = true
    navigator.serviceWorker
      .register('/sw.js')
      .then((registro) => registro.pushManager.getSubscription())
      .then((atual) => {
        if (!vivo) return
        setInscricao(atual)
        setEstado(atual ? 'ligado' : 'desligado')
      })
      .catch(() => vivo && setEstado('sem-suporte'))

    return () => {
      vivo = false
    }
  }, [suportado, chavePublica])

  const inscrever = useCallback(async () => {
    const registro = await navigator.serviceWorker.ready
    const nova = await registro.pushManager.subscribe({
      // Sem isto o navegador entrega a qualquer servidor que tenha o endpoint.
      userVisibleOnly: true,
      applicationServerKey: paraBytes(chavePublica),
    })
    setInscricao(nova)
    setEstado('ligado')
    return nova
  }, [chavePublica])

  /*
   * Sem chave VAPID o recurso não existe nesta instalação, e dizer isso ao
   * aluno seria falar de configuração de servidor com quem só quer treinar.
   * O cartão some, como o botão de PIX some quando não há provedor.
   */
  if (estado === 'carregando' || estado === 'sem-chave') return null

  if (estado === 'sem-suporte') {
    return (
      <Aviso>
        Este navegador não entrega avisos com o app fechado. No iPhone, é preciso adicionar o Synse
        à tela de início primeiro.
      </Aviso>
    )
  }

  if (estado === 'negado') {
    return (
      <Aviso>
        Os avisos foram bloqueados para o Synse neste navegador. Para voltar a receber, libere as
        notificações nas configurações do site — daqui não dá para desfazer.
      </Aviso>
    )
  }

  const mensagem = falhaLocal ?? ligar.ok ?? ligar.error ?? desligar.ok ?? desligar.error
  const ruim = Boolean(falhaLocal || ligar.error || desligar.error)

  return (
    <div className="space-y-3 rounded-xl border border-synse-border bg-synse-surface-2 p-4">
      <div className="flex items-start gap-3">
        {estado === 'ligado' ? (
          <Bell className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
        ) : (
          <BellOff className="mt-0.5 size-4 shrink-0 text-synse-muted" aria-hidden />
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-synse-text">Avisos neste aparelho</p>
          <p className="text-xs text-synse-muted">
            {estado === 'ligado'
              ? 'Você recebe aviso de treino e da sua academia mesmo com o app fechado.'
              : 'Receba aviso de treino e da sua academia mesmo com o app fechado.'}
          </p>
        </div>
      </div>

      {estado === 'ligado' ? (
        <form action={acaoDesligar}>
          <input type="hidden" name="endpoint" value={inscricao?.endpoint ?? ''} />
          <Botao rotulo="Desligar" pendente="Desligando…" variante="outline" />
        </form>
      ) : (
        <form
          action={acaoLigar}
          onSubmit={async (evento) => {
            /*
             * A inscrição precisa existir antes de o formulário sair, e ela é
             * assíncrona — daí o `preventDefault` e o envio à mão. Sem isso o
             * servidor receberia campos vazios e a pessoa leria "inscrição
             * incompleta" sem ter feito nada errado.
             */
            evento.preventDefault()
            const formulario = evento.currentTarget
            setFalhaLocal(null)
            try {
              const nova = await inscrever()
              const json = nova.toJSON()
              const dados = new FormData()
              dados.set('endpoint', nova.endpoint)
              dados.set('p256dh', json.keys?.p256dh ?? '')
              dados.set('auth', json.keys?.auth ?? '')
              dados.set('userAgent', navigator.userAgent)
              acaoLigar(dados)
            } catch {
              if (Notification.permission === 'denied') {
                // Recusa no prompt. A tela de "negado" já explica o caminho.
                setEstado('negado')
              } else {
                setEstado('desligado')
                setFalhaLocal(
                  'Não conseguimos ligar os avisos neste aparelho agora. Tente de novo em instantes.',
                )
              }
            }
            formulario.reset()
          }}
        >
          <Botao rotulo="Ligar avisos" pendente="Ligando…" variante="gradient" />
        </form>
      )}

      {mensagem && (
        <p
          role="status"
          className={ruim ? 'text-xs text-synse-danger' : 'text-xs text-synse-success'}
        >
          {mensagem}
        </p>
      )}
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-synse-border bg-synse-surface-2 p-4 text-xs text-synse-muted">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Botao({
  rotulo,
  pendente,
  variante,
}: {
  rotulo: string
  pendente: string
  variante: 'gradient' | 'outline'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variante} size="sm" className="w-full" disabled={pending}>
      {pending ? pendente : rotulo}
    </Button>
  )
}
