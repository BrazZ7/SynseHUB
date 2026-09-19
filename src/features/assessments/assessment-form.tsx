'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveAssessmentAction } from '@/features/assessments/actions'
import {
  densidadeCorporal,
  foraDaFaixaValidada,
  imc,
  percentualDeGordura,
  pontosExigidos,
  somaDasDobras,
  type Dobras,
} from '@/features/assessments/composition'
import { initialAssessmentState } from '@/features/assessments/state'
import type { Assessment, AssessmentProtocol, AssessmentSex } from '@/types/domain'

const ROTULO_DOBRA: Record<keyof Dobras, { label: string; campo: string; onde: string }> = {
  chest: { label: 'Peitoral', campo: 'skinfoldChest', onde: 'Diagonal, entre a axila e o mamilo.' },
  axilla: { label: 'Axilar média', campo: 'skinfoldAxilla', onde: 'Linha axilar média, na altura do apêndice xifoide.' },
  triceps: { label: 'Tríceps', campo: 'skinfoldTriceps', onde: 'Vertical, no ponto médio do braço.' },
  subscapular: { label: 'Subescapular', campo: 'skinfoldSubscapular', onde: 'Diagonal, abaixo da escápula.' },
  abdominal: { label: 'Abdominal', campo: 'skinfoldAbdominal', onde: 'Vertical, 2 cm ao lado do umbigo.' },
  suprailiac: { label: 'Supra-ilíaca', campo: 'skinfoldSuprailiac', onde: 'Diagonal, acima da crista ilíaca.' },
  thigh: { label: 'Coxa', campo: 'skinfoldThigh', onde: 'Vertical, no ponto médio da coxa.' },
}

const CIRCUNFERENCIAS: Array<{ campo: string; label: string }> = [
  { campo: 'chest', label: 'Tórax' },
  { campo: 'arm', label: 'Braço' },
  { campo: 'waist', label: 'Cintura' },
  { campo: 'abdomen', label: 'Abdômen' },
  { campo: 'hip', label: 'Quadril' },
  { campo: 'thigh', label: 'Coxa' },
  { campo: 'calf', label: 'Panturrilha' },
]

const numero = (valor: string | undefined) => {
  if (!valor) return null
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Ficha de avaliação física.
 *
 * Os campos são não controlados — o navegador guarda o que foi digitado, e o
 * avaliador que perde a conexão no meio da ficha não perde as medidas. O
 * `onChange` no formulário inteiro só lê o FormData para o resumo ao lado
 * acompanhar; nenhum input depende do estado para existir.
 *
 * O percentual mostrado aqui é prévia. Quem grava é o gatilho da 0023, que
 * refaz a conta no banco: as duas fórmulas são comparadas em teste justamente
 * para o número da tela nunca discordar do número guardado.
 */
export function AssessmentForm({
  studentId,
  studentName,
  hoje,
  alturaSugerida,
  idadeSugerida,
  assessment,
}: {
  studentId: string
  studentName: string
  hoje: string
  /** Última altura registrada: altura não muda entre avaliações, mas some se ninguém redigita. */
  alturaSugerida: number | null
  /** Idade calculada da data de nascimento no dia da avaliação. */
  idadeSugerida: number | null
  assessment?: Assessment
}) {
  const [state, formAction] = useActionState(saveAssessmentAction, initialAssessmentState)

  const [valores, setValores] = useState<Record<string, string>>({
    protocol: assessment?.protocol ?? 'MANUAL',
    protocolSex: assessment?.protocolSex ?? '',
    ageYears: String(assessment?.ageYears ?? idadeSugerida ?? ''),
    weight: String(assessment?.weight ?? ''),
    height: String(assessment?.height ?? alturaSugerida ?? ''),
    bodyFatPercentage: String(assessment?.bodyFatPercentage ?? ''),
  })

  const protocolo = (valores.protocol || 'MANUAL') as AssessmentProtocol
  const sexo = (valores.protocolSex || null) as AssessmentSex | null
  const idade = numero(valores.ageYears)

  const previa = useMemo(() => {
    const dobras: Dobras = {
      chest: numero(valores.skinfoldChest),
      axilla: numero(valores.skinfoldAxilla),
      triceps: numero(valores.skinfoldTriceps),
      subscapular: numero(valores.skinfoldSubscapular),
      abdominal: numero(valores.skinfoldAbdominal),
      suprailiac: numero(valores.skinfoldSuprailiac),
      thigh: numero(valores.skinfoldThigh),
    }
    const soma = somaDasDobras(protocolo, sexo, dobras)
    const densidade = densidadeCorporal(protocolo, sexo, idade, soma)
    return {
      soma,
      densidade,
      imc: imc(numero(valores.weight), numero(valores.height)),
      gordura:
        protocolo === 'MANUAL'
          ? numero(valores.bodyFatPercentage)
          : percentualDeGordura(densidade),
    }
  }, [valores, protocolo, sexo, idade])

  const pontos = pontosExigidos(protocolo, sexo)
  const foraDaFaixa = protocolo !== 'MANUAL' && foraDaFaixaValidada(sexo, idade)

  return (
    <form
      action={formAction}
      /*
       * Lê o formulário inteiro a cada tecla. Custa uma varredura de trinta
       * campos e evita trinta `useState` — e mantém os inputs não controlados.
       */
      onChange={(evento) =>
        setValores(
          Object.fromEntries(
            Array.from(new FormData(evento.currentTarget).entries()).map(([chave, valor]) => [
              chave,
              String(valor),
            ]),
          ),
        )
      }
      className="space-y-6"
      noValidate
    >
      <input type="hidden" name="studentId" value={studentId} />
      {assessment && <input type="hidden" name="assessmentId" value={assessment.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href={`/students/${studentId}`}>Ver a ficha de {studentName}</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold text-synse-text">A avaliação</legend>

        <Field
          id="assessedAt"
          label="Data"
          errors={state.fieldErrors?.assessedAt}
          input={
            <Input
              id="assessedAt"
              name="assessedAt"
              type="date"
              max={hoje}
              defaultValue={assessment?.assessedAt ?? hoje}
              required
            />
          }
        />

        <Field
          id="protocol"
          label="Protocolo"
          errors={state.fieldErrors?.protocol}
          input={
            <select
              id="protocol"
              name="protocol"
              defaultValue={assessment?.protocol ?? 'MANUAL'}
              className={SELECT_CLASS}
            >
              <option value="MANUAL">Percentual informado (bioimpedância, etc.)</option>
              <option value="POLLOCK_3">Dobras — Pollock 3 pontos</option>
              <option value="POLLOCK_7">Dobras — Pollock 7 pontos</option>
            </select>
          }
        />

        <Field
          id="protocolSex"
          label="Equação"
          hint={protocolo === 'MANUAL' ? 'Só é usada nos protocolos de dobras.' : undefined}
          errors={state.fieldErrors?.protocolSex}
          input={
            <select
              id="protocolSex"
              name="protocolSex"
              defaultValue={assessment?.protocolSex ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">Não se aplica</option>
              <option value="MALE">Masculina</option>
              <option value="FEMALE">Feminina</option>
            </select>
          }
        />
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 border-t border-synse-border pt-6 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Corpo</legend>

        <Field
          id="weight"
          label="Peso (kg)"
          errors={state.fieldErrors?.weight}
          input={
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min="0"
              max="400"
              defaultValue={assessment?.weight ?? ''}
            />
          }
        />
        <Field
          id="height"
          label="Altura (cm)"
          errors={state.fieldErrors?.height}
          input={
            <Input
              id="height"
              name="height"
              type="number"
              step="0.5"
              min="0"
              max="260"
              defaultValue={assessment?.height ?? alturaSugerida ?? ''}
            />
          }
        />
        <Field
          id="ageYears"
          label="Idade"
          hint={idadeSugerida != null && !assessment ? 'Calculada da data de nascimento.' : undefined}
          errors={state.fieldErrors?.ageYears}
          input={
            <Input
              id="ageYears"
              name="ageYears"
              type="number"
              min="0"
              max="120"
              defaultValue={assessment?.ageYears ?? idadeSugerida ?? ''}
            />
          }
        />
        {protocolo === 'MANUAL' && (
          <Field
            id="bodyFatPercentage"
            label="Gordura (%)"
            errors={state.fieldErrors?.bodyFatPercentage}
            input={
              <Input
                id="bodyFatPercentage"
                name="bodyFatPercentage"
                type="number"
                step="0.1"
                min="0"
                max="80"
                defaultValue={assessment?.bodyFatPercentage ?? ''}
              />
            }
          />
        )}
      </fieldset>

      {pontos.length > 0 && (
        <fieldset className="space-y-3 border-t border-synse-border pt-6">
          <legend className="mb-1 text-sm font-semibold text-synse-text">
            Dobras cutâneas (mm)
          </legend>
          <p className="text-xs text-synse-muted">
            {pontos.length} pontos, do lado direito do corpo, média de duas medidas. O conjunto faz
            parte da equação: trocar os pontos muda o resultado.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {pontos.map((ponto) => {
              const { label, campo, onde } = ROTULO_DOBRA[ponto]
              return (
                <Field
                  key={campo}
                  id={campo}
                  label={label}
                  hint={onde}
                  errors={state.fieldErrors?.[campo]}
                  input={
                    <Input
                      id={campo}
                      name={campo}
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      defaultValue={
                        (assessment?.[
                          campo as keyof Assessment
                        ] as number | null | undefined) ?? ''
                      }
                    />
                  }
                />
              )
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-3 border-t border-synse-border pt-6">
        <legend className="mb-1 text-sm font-semibold text-synse-text">
          Circunferências (cm)
        </legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CIRCUNFERENCIAS.map(({ campo, label }) => (
            <Field
              key={campo}
              id={campo}
              label={label}
              errors={state.fieldErrors?.[campo]}
              input={
                <Input
                  id={campo}
                  name={campo}
                  type="number"
                  step="0.5"
                  min="0"
                  max="250"
                  defaultValue={
                    (assessment?.[campo as keyof Assessment] as number | null | undefined) ?? ''
                  }
                />
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="border-t border-synse-border pt-6">
        <Field
          id="notes"
          label="Observações"
          hint="Fica na ficha do aluno. Até 600 caracteres."
          errors={state.fieldErrors?.notes}
          input={
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={600}
              defaultValue={assessment?.notes ?? ''}
              placeholder="Postura, restrições, o que observar na próxima."
            />
          }
        />
      </div>

      <Resumo previa={previa} protocolo={protocolo} foraDaFaixa={foraDaFaixa} sexo={sexo} />

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton editando={Boolean(assessment)} />
        <Button variant="ghost" asChild>
          <Link href={`/students/${studentId}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function Resumo({
  previa,
  protocolo,
  foraDaFaixa,
  sexo,
}: {
  previa: { soma: number | null; densidade: number | null; imc: number | null; gordura: number | null }
  protocolo: AssessmentProtocol
  foraDaFaixa: boolean
  sexo: AssessmentSex | null
}) {
  return (
    <div className="rounded-xl border border-synse-border bg-synse-surface-2 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-synse-muted">
        Prévia — recalculada no servidor ao salvar
      </p>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero rotulo="IMC" valor={previa.imc} />
        <Numero rotulo="Gordura" valor={previa.gordura} sufixo="%" />
        {protocolo !== 'MANUAL' && <Numero rotulo="Soma das dobras" valor={previa.soma} sufixo=" mm" />}
        {protocolo !== 'MANUAL' && <Numero rotulo="Densidade" valor={previa.densidade} casas={5} />}
      </dl>
      {foraDaFaixa && (
        <p className="mt-3 text-xs text-synse-warning">
          A equação de Pollock foi validada entre 18 e {sexo === 'MALE' ? 61 : 55} anos. Fora dessa
          faixa o número sai, mas trate como estimativa e acompanhe a tendência, não o valor.
        </p>
      )}
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  sufixo = '',
  casas = 2,
}: {
  rotulo: string
  valor: number | null
  sufixo?: string
  casas?: number
}) {
  return (
    <div>
      <dt className="text-xs text-synse-muted">{rotulo}</dt>
      <dd className="text-lg font-semibold tabular-nums text-synse-text">
        {valor == null ? '—' : `${valor.toFixed(casas)}${sufixo}`}
      </dd>
    </div>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : editando ? 'Salvar correção' : 'Registrar avaliação'}
    </Button>
  )
}
