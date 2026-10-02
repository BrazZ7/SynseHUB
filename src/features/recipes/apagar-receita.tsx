'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/synse/confirm-dialog'
import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { apagarReceitaAction } from '@/features/recipes/admin-actions'
import { recipeAdminInicial } from '@/features/recipes/admin-state'

/**
 * ── Apagar a receita ────────────────────────────────────────────────────────
 *
 * Existe como componente, e não só como action, porque é essa a diferença
 * entre uma porta e um corredor sem porta: `apagarProgramaAction` foi escrita
 * na 0043 e ficou cinco commits sem tela que a chamasse.
 *
 * ── Duas correções da primeira versão ───────────────────────────────────────
 *
 * A primeira versão deste componente era um `<form>` simples, e tinha dois
 * problemas que o do programa expôs:
 *
 * 1. **Ficava na tela depois de apagar.** A action revalida a lista, mas esta
 *    página é a da receita que acabou de deixar de existir: sobrava um
 *    formulário de algo apagado, e o primeiro recarregar virava 404 sem
 *    explicação.
 * 2. **Não perguntava nada.** Apagar aqui tira a receita de toda a base e não
 *    se desfaz — é exatamente o caso para o qual `ConfirmDialog` foi escrito,
 *    e para o qual ele esperava desde que entrou no repositório sem nenhum
 *    uso.
 *
 * O aviso é mais curto que o do programa de propósito: receita não tem
 * matrícula pendurada, então o que some é o trabalho de quem escreveu — não o
 * progresso de terceiros.
 */
export function ApagarReceita({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const [estado, setEstado] = useState(recipeAdminInicial)

  async function apagar() {
    const dados = new FormData()
    dados.set('recipeId', recipeId)
    const resultado = await apagarReceitaAction(recipeAdminInicial, dados)
    setEstado(resultado)

    if (resultado.status === 'success') {
      router.push('/synse-admin/receitas')
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
            Apagar receita
          </Button>
        }
        title="Apagar esta receita?"
        description="A receita sai da biblioteca de toda a base, na hora. Não há como desfazer."
        confirmLabel="Apagar mesmo assim"
        destructive
        onConfirm={apagar}
      />
    </div>
  )
}
