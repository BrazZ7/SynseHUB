'use client'

import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { removeAvatarAction, uploadAvatarAction } from '@/features/account/avatar-actions'
import { AVATAR_LADO_PX } from '@/features/account/state'

/**
 * A foto de perfil.
 *
 * ── Por que o aparelho processa antes de enviar ─────────────────────────────
 *
 * Uma foto de celular tem 3 a 5 MB e 4000 pixels de lado. O avatar aparece com
 * 64. Mandar o original gastaria a franquia de dados de quem está na rua para
 * o servidor jogar 99% fora — e uma pilha de processamento de imagem no
 * servidor só para isso é peso que não se paga.
 *
 * Aqui a foto é recortada no quadrado central, reduzida e convertida em WebP
 * antes de sair do aparelho: sobram dezenas de KB. O servidor valida de novo o
 * que chegou, porque o formulário é editável e o cliente pode mentir.
 */
export function AvatarPicker({
  nome,
  fotoAtual,
}: {
  nome: string
  fotoAtual: string | null
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, iniciarTransicao] = useTransition()
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  /** Mostra a foto nova antes de o servidor confirmar — o toque responde na hora. */
  const [previa, setPrevia] = useState<string | null>(null)

  async function escolher(arquivo: File) {
    setErro(null)
    setProcessando(true)

    try {
      const quadrada = await recortarEReduzir(arquivo)
      setPrevia(URL.createObjectURL(quadrada))

      const dados = new FormData()
      dados.append('foto', new File([quadrada], 'avatar.webp', { type: 'image/webp' }))

      iniciarTransicao(async () => {
        const resposta = await uploadAvatarAction(dados)
        if (resposta.status === 'error') {
          setErro(resposta.message)
          setPrevia(null)
          return
        }
        router.refresh()
      })
    } catch {
      setErro('Não foi possível ler esta imagem. Tente outra.')
      setPrevia(null)
    } finally {
      setProcessando(false)
    }
  }

  const ocupado = enviando || processando

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <StudentAvatar name={nome} avatarUrl={previa ?? fotoAtual} size="xl" />
        {ocupado && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-synse-dark/60">
            <Loader2 className="size-5 animate-spin text-white" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0]
            // Limpa o valor: escolher a mesma foto duas vezes precisa disparar.
            evento.target.value = ''
            if (arquivo) void escolher(arquivo)
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => entrada.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            {fotoAtual ? 'Trocar foto' : 'Adicionar foto'}
          </Button>

          {fotoAtual && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() =>
                iniciarTransicao(async () => {
                  const resposta = await removeAvatarAction()
                  if (resposta.status === 'error') {
                    setErro(resposta.message)
                    return
                  }
                  setPrevia(null)
                  router.refresh()
                })
              }
            >
              <Trash2 className="size-4" aria-hidden />
              Remover
            </Button>
          )}
        </div>

        {erro ? (
          <p className="text-xs text-synse-danger">{erro}</p>
        ) : (
          <p className="text-xs text-synse-muted">
            Só você e a equipe da sua academia veem sua foto.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Recorta no quadrado central e reduz.
 *
 * `createImageBitmap` e não `<img>`: ele decodifica fora da thread principal,
 * então escolher uma foto de 12 megapixels não trava a interface no meio do
 * gesto. O recorte central é o que evita a foto esticada — o avatar é redondo,
 * e uma imagem deformada num círculo fica pior que sem foto.
 */
async function recortarEReduzir(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo)

  const lado = Math.min(bitmap.width, bitmap.height)
  const x = (bitmap.width - lado) / 2
  const y = (bitmap.height - lado) / 2

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_LADO_PX
  canvas.height = AVATAR_LADO_PX

  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('canvas indisponível')

  contexto.drawImage(bitmap, x, y, lado, lado, 0, 0, AVATAR_LADO_PX, AVATAR_LADO_PX)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('conversão falhou'))),
      'image/webp',
      0.85,
    )
  })
}
