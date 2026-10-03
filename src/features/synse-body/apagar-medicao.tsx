'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/synse/confirm-dialog'
import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { deleteBodyMeasurementAction } from '@/features/synse-body/actions'

/**
 * Apagar uma medição.
 *
 * `deleteBodyMeasurementAction` existe desde a 0032 com o comentário certo —
 * "dado corporal que não se apaga é dado que prende" — e ficou sem tela. A
 * RLS (`body_measurements_delete_self`) só deixa apagar o que é da própria
 * pessoa, então a trava é do banco; o que faltava era o gesto.
 *
 * Com diálogo porque a pesagem não volta. Sem alarde: um ícone na linha, que
 * é onde a pessoa está olhando quando decide que aquela medição está errada
 * — a balança pesou com roupa, ou pegou outra pessoa da casa.
 */
export function ApagarMedicao({
  measurementId,
  quando,
}: {
  measurementId: string
  quando: string
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)

  async function apagar() {
    const resultado = await deleteBodyMeasurementAction(measurementId)
    if (resultado.status === 'error') {
      setErro(resultado.message)
      return
    }
    setErro(null)
    router.refresh()
  }

  return (
    <>
      {erro && <Feedback tone="error" message={erro} />}
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-synse-muted"
            aria-label={`Apagar a medição de ${quando}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        }
        title="Apagar esta medição?"
        description={`A pesagem de ${quando} sai do seu histórico e dos gráficos. Não há como desfazer.`}
        confirmLabel="Apagar"
        destructive
        onConfirm={apagar}
      />
    </>
  )
}
