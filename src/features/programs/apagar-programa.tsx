'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/synse/confirm-dialog'
import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { apagarProgramaAction } from '@/features/programs/admin-actions'
import { programAdminInicial } from '@/features/programs/admin-state'

/**
 * ── Apagar o programa ───────────────────────────────────────────────────────
 *
 * `apagarProgramaAction` foi escrita na 0043 e ficou cinco commits sem uma
 * tela que a chamasse: escrita testada, revisada, e inalcançável. Esta é a
 * porta que faltava.
 *
 * ── Por que aqui tem diálogo, e no "sair do programa" não ───────────────────
 *
 * `acoes-do-programa.tsx` dispensa confirmação de propósito, e a razão está
 * escrita lá: sair guarda o que já foi feito e recomeçar está a um toque —
 * "diálogo de confirmação é para o que não se desfaz".
 *
 * Isto não se desfaz, e o estrago não é só do autor. A 0003 pendura
 * `program_steps` **e** `program_enrollments` em `programs` com
 * `on delete cascade`: apagar leva junto os dias montados e o progresso de
 * toda pessoa que estiver fazendo o programa, em qualquer academia. Quem
 * clica é a plataforma; quem perde é o aluno, que não participou da decisão.
 *
 * `ConfirmDialog` existia desde sempre em `components/synse/` e nunca tinha
 * sido usado. Era o caso para o qual ele foi escrito.
 */
export function ApagarPrograma({ programId, dias }: { programId: string; dias: number }) {
  const router = useRouter()
  const [estado, setEstado] = useState(programAdminInicial)

  async function apagar() {
    const dados = new FormData()
    dados.set('programId', programId)
    const resultado = await apagarProgramaAction(programAdminInicial, dados)
    setEstado(resultado)

    /*
     * Sair da tela quando deu certo.
     *
     * A action revalida a lista, mas esta página é a do programa que acabou
     * de deixar de existir: ficar nela mostra um formulário de algo apagado,
     * e o primeiro recarregar vira 404 sem explicação. `refresh` junto com o
     * `push` porque a lista precisa ser relida do servidor, não do cache.
     */
    if (resultado.status === 'success') {
      router.push('/synse-admin/programas')
      router.refresh()
    }
  }

  return (
    <div className="space-y-3">
      {estado.status === 'error' && <Feedback tone="error" message={estado.message ?? ''} />}

      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <Trash2 className="size-4" aria-hidden />
            Apagar programa
          </Button>
        }
        title="Apagar este programa?"
        description={`Os ${dias} dias montados somem, e o progresso de todo aluno que estiver fazendo este programa some junto. Não há como desfazer.`}
        confirmLabel="Apagar mesmo assim"
        destructive
        onConfirm={apagar}
      />
    </div>
  )
}
