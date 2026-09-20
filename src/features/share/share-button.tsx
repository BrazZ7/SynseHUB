'use client'

import { Check, Download, Loader2, Share2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { novaTela, paraBlob } from '@/features/share/card-base'
import { NOME_DO_ARQUIVO, desenhar, type Cartao } from '@/features/share/cards'
import { cn } from '@/lib/utils'

/**
 * Compartilhar uma conquista como imagem.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * Até aqui nada saía do aplicativo: traçado, medalha e recorde morriam dentro
 * do aparelho. Esta é a única superfície do produto que traz gente nova sem
 * custo por pessoa — cada imagem postada é a marca circulando de graça.
 *
 * ── Por que no `canvas`, e não no servidor ──────────────────────────────────
 *
 * Gerar no servidor renderiza tipografia igual em todo aparelho, mas custa uma
 * rota nova, um arquivo de fonte no repositório e uma ida à rede no exato
 * momento em que a pessoa quer postar — muitas vezes na rua, com sinal ruim,
 * logo depois de treinar. No `canvas` é instantâneo, funciona sem rede e não
 * acrescenta dependência. Os dados já estão na tela.
 *
 * ── Dois formatos ───────────────────────────────────────────────────────────
 *
 * Botão de largura cheia embaixo da corrida, que é uma tela só para ela; e
 * ícone discreto em lista de medalha e de recorde, onde um botão por linha
 * afogaria o conteúdo.
 */
export function BotaoCompartilhar({
  cartao,
  formato = 'botao',
  rotulo,
  nota,
}: {
  cartao: Cartao
  formato?: 'botao' | 'icone'
  rotulo?: string
  /** Linha de apoio embaixo do botão. Só faz sentido no formato inteiro. */
  nota?: string
}) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'pronto'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  const podeCompartilhar = typeof navigator !== 'undefined' && 'canShare' in navigator

  async function compartilhar() {
    setErro(null)
    setEstado('gerando')
    try {
      const { tela, c } = await novaTela()
      desenhar(c, cartao)
      const blob = await paraBlob(tela)
      const arquivo = new File([blob], NOME_DO_ARQUIVO[cartao.tipo], { type: 'image/png' })

      /*
       * `canShare` com o arquivo, e não só `navigator.share`: há navegador que
       * compartilha texto e recusa arquivo, e aí a chamada falha depois de a
       * pessoa já ter tocado. Quando não dá, baixa — caminho que sempre existe.
       */
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo] })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = arquivo.name
        link.click()
        URL.revokeObjectURL(url)
      }
      setEstado('pronto')
      setTimeout(() => setEstado('parado'), 2200)
    } catch (e) {
      // Cancelar no menu do sistema chega como erro, e não é um.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setEstado('parado')
        return
      }
      setErro('Não foi possível gerar a imagem.')
      setEstado('parado')
    }
  }

  const Icone =
    estado === 'gerando'
      ? Loader2
      : estado === 'pronto'
        ? Check
        : podeCompartilhar
          ? Share2
          : Download

  if (formato === 'icone') {
    return (
      <button
        type="button"
        onClick={compartilhar}
        disabled={estado === 'gerando'}
        aria-label={rotulo ?? 'Compartilhar'}
        title={erro ?? rotulo ?? 'Compartilhar'}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-synse-muted transition-colors hover:bg-synse-surface-2 hover:text-synse-primary disabled:opacity-50"
      >
        <Icone className={cn('size-4', estado === 'gerando' && 'animate-spin')} aria-hidden />
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={compartilhar}
        disabled={estado === 'gerando'}
      >
        <Icone className={cn('size-4', estado === 'gerando' && 'animate-spin')} aria-hidden />
        {estado === 'gerando'
          ? 'Gerando…'
          : estado === 'pronto'
            ? 'Pronto'
            : podeCompartilhar
              ? (rotulo ?? 'Compartilhar')
              : `Baixar imagem${rotulo ? '' : ''}`}
      </Button>
      {erro && <p className="text-xs text-synse-danger">{erro}</p>}
      {nota && !erro && <p className="text-center text-[11px] text-synse-muted">{nota}</p>}
    </div>
  )
}
