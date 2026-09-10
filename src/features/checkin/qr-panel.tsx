'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Totem de check-in.
 *
 * O QR mostrado é dinâmico e expira — um print antigo não vale como presença.
 * Aqui ele é renderizado como matriz visual determinística a partir do token;
 * na integração real o payload é assinado no servidor com o segredo da
 * organização (`organization_settings.checkin_qr_secret`).
 */
const ROTATION_SECONDS = 60

export function QrPanel({ organizationSlug }: { organizationSlug: string }) {
  // O token é aleatório: gerá-lo no servidor divergiria da hidratação.
  const [token, setToken] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(ROTATION_SECONDS)

  useEffect(() => {
    setToken(makeToken())
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          setToken(makeToken())
          return ROTATION_SECONDS
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4" aria-busy>
        <div className="size-[184px] animate-pulse rounded-2xl bg-synse-surface-2" />
        <p className="text-xs text-synse-muted">Gerando código…</p>
      </div>
    )
  }

  const matrix = matrixFor(`${organizationSlug}:${token}`)

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-full max-w-[220px] rounded-2xl bg-white p-4 shadow-synse"
        role="img"
        aria-label="QR Code de check-in da academia"
      >
        {/* Matriz fluida: acompanha a largura do card em telas estreitas. */}
        <div
          className="grid w-full gap-px"
          style={{ gridTemplateColumns: `repeat(${MATRIX_SIZE}, minmax(0, 1fr))` }}
        >
          {matrix.map((filled, index) => (
            <span
              key={index}
              className={
                filled ? 'aspect-square w-full bg-synse-dark' : 'aspect-square w-full bg-transparent'
              }
            />
          ))}
        </div>
      </div>

      <div className="text-center">
        <p className="font-mono text-sm tracking-widest text-synse-text">{token}</p>
        <p className="mt-1 text-xs text-synse-muted">
          Novo código em {remaining}s — o aluno escaneia pelo Synse App.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setToken(makeToken())
          setRemaining(ROTATION_SECONDS)
        }}
      >
        <RefreshCw className="size-4" />
        Gerar novo código
      </Button>
    </div>
  )
}

const MATRIX_SIZE = 21

function makeToken() {
  const bytes = new Uint8Array(4)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Padrão visual determinístico derivado do token — não é um QR Code válido. */
function matrixFor(seed: string): boolean[] {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  const cells: boolean[] = []
  for (let index = 0; index < MATRIX_SIZE * MATRIX_SIZE; index += 1) {
    const row = Math.floor(index / MATRIX_SIZE)
    const column = index % MATRIX_SIZE

    // Marcadores de posição nos três cantos, como num QR real.
    if (isFinderPattern(row, column)) {
      cells.push(isFinderInk(row, column))
      continue
    }

    hash ^= hash << 13
    hash ^= hash >>> 17
    hash ^= hash << 5
    cells.push((hash >>> 0) % 100 < 46)
  }
  return cells
}

function isFinderPattern(row: number, column: number) {
  const inTopLeft = row < 7 && column < 7
  const inTopRight = row < 7 && column >= MATRIX_SIZE - 7
  const inBottomLeft = row >= MATRIX_SIZE - 7 && column < 7
  return inTopLeft || inTopRight || inBottomLeft
}

function isFinderInk(row: number, column: number) {
  const r = row < 7 ? row : row - (MATRIX_SIZE - 7)
  const c = column < 7 ? column : column - (MATRIX_SIZE - 7)
  const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
  return ring === 3 || ring <= 1
}
