'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordManualMeasurementAction } from '@/features/synse-body/actions'
import { novoClientId } from '@/features/synse-body/engine/dedup'

/**
 * Pesar sem balança inteligente.
 *
 * Precisa existir. A balança pode estar sem pilha, a pessoa pode estar na
 * academia, e um histórico que só aceita leitura de aparelho tem buraco
 * justamente nas semanas em que a pessoa mais quis acompanhar.
 *
 * O que ele não faz é inventar composição corporal. Peso, e gordura se a
 * pessoa tiver o número de outra fonte — nada de estimar percentual a partir
 * de fórmula não validada e mostrar como se a balança tivesse medido.
 */
export function ManualEntry() {
  const router = useRouter()
  const [enviando, iniciarTransicao] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  return (
    <form
      className="space-y-4"
      onSubmit={(evento) => {
        evento.preventDefault()
        const dados = new FormData(evento.currentTarget)
        const peso = Number(String(dados.get('peso') ?? '').replace(',', '.'))
        const gorduraCrua = String(dados.get('gordura') ?? '').replace(',', '.')

        setErro(null)
        setSalvo(false)

        iniciarTransicao(async () => {
          const resposta = await recordManualMeasurementAction({
            clientId: novoClientId(),
            weightKg: peso,
            bodyFatPercent: gorduraCrua === '' ? null : Number(gorduraCrua),
          })

          if (resposta.status === 'error') {
            setErro(resposta.message)
            return
          }
          setSalvo(true)
          router.refresh()
        })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="peso">Peso (kg)</Label>
        <Input
          id="peso"
          name="peso"
          inputMode="decimal"
          required
          placeholder="70,4"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gordura">Gordura corporal (%) — opcional</Label>
        <Input id="gordura" name="gordura" inputMode="decimal" placeholder="22,4" autoComplete="off" />
        <p className="text-xs text-synse-muted">
          Só preencha se você tiver esse número de uma avaliação ou de outra balança. O Synse não
          estima gordura corporal a partir do peso.
        </p>
      </div>

      {erro && <p className="text-sm text-synse-danger">{erro}</p>}
      {salvo && <p className="text-sm text-synse-success">Medição salva.</p>}

      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar medição'}
      </Button>
    </form>
  )
}
