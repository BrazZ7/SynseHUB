'use client'

import { useState } from 'react'
import { ImageDown, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { entregarImagem, gerarPapelDeParede } from '@/features/plano/papel-de-parede'
import type { RoutineBlock } from '@/types/domain'

/**
 * ── "Pôr na tela bloqueada" ─────────────────────────────────────────────────
 *
 * O botão diz o que a pessoa quer, e a tela diz a verdade do que acontece.
 *
 * Nenhum app troca o papel de parede do iPhone — não existe API, e isso não vai
 * mudar por esforço nosso. No Android dá, mas exige código nativo e versão nova
 * na loja. Então o que este botão faz é **gerar a imagem e entregá-la**: no
 * celular, pelo menu de compartilhamento, que tem "Salvar em Fotos"; no
 * computador, como download.
 *
 * O passo que falta — abrir os ajustes e aplicar — é da pessoa, e a tela
 * explica em uma linha em vez de deixar o PNG cair em Arquivos sem instrução.
 */
export function BotaoPapelDeParede({
  meta,
  blocos,
}: {
  meta: string | null
  blocos: readonly RoutineBlock[]
}) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'compartilhou' | 'baixou'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  const gerar = async () => {
    setErro(null)
    setEstado('gerando')
    try {
      const blob = await gerarPapelDeParede({ meta, blocos })
      setEstado(await entregarImagem(blob))
    } catch (falha) {
      /*
       * Cancelar o menu de compartilhamento dispara `AbortError`. Não é erro:
       * a pessoa mudou de ideia, e uma caixa vermelha para isso seria a tela
       * discutindo com ela.
       */
      if (falha instanceof DOMException && falha.name === 'AbortError') setEstado('parado')
      else {
        setErro('Não deu para gerar a imagem neste navegador.')
        setEstado('parado')
      }
    }
  }

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-synse-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-synse-text">Seu plano na tela bloqueada</h2>
      </div>

      <p className="mt-1 text-sm text-synse-muted">
        Gera uma imagem com a sua meta e os horários de hoje. Você salva e põe como papel de
        parede.
      </p>

      <Button variant="outline" className="mt-3 w-full" onClick={gerar} disabled={estado === 'gerando'}>
        <ImageDown className="size-4" aria-hidden />
        {estado === 'gerando' ? 'Gerando…' : 'Gerar a imagem'}
      </Button>

      {/*
        O passo seguinte, dito na hora e conforme o que aconteceu. Sem isto o
        arquivo cai em algum lugar e a pessoa não sabe o que fazer com ele.
      */}
      {estado === 'compartilhou' && (
        <p className="mt-2 text-xs text-synse-muted">
          Escolha <strong>Salvar em Fotos</strong>. Depois, em Ajustes → Papel de parede, selecione
          a imagem.
        </p>
      )}
      {estado === 'baixou' && (
        <p className="mt-2 text-xs text-synse-muted">
          A imagem foi baixada. Mande para o celular e defina como papel de parede da tela
          bloqueada.
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-synse-danger">{erro}</p>}

      {/*
        A verdade sobre o que o app pode e não pode. Dita uma vez, embaixo, sem
        atrapalhar quem só quer o botão — e sem prometer automação que o
        sistema não permite.
      */}
      <p className="mt-3 border-t border-synse-border pt-3 text-[11px] text-synse-muted">
        Trocar o papel de parede sozinho não é permitido pelo iPhone a nenhum aplicativo. Por isso
        a imagem é sua para aplicar.
      </p>
    </section>
  )
}
