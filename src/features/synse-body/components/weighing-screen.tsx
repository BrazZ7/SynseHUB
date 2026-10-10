'use client'

import { AlertTriangle, Bluetooth, CheckCircle2, CloudOff, Loader2, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'

import { MeasurementField } from '@/features/synse-body/components/measurement-field'
import { TEXTO_DO_ESTADO } from '@/features/synse-body/engine/weighing-machine'
import { mockScaleProvider } from '@/features/synse-body/providers/mock'
import { standardBleScaleProvider } from '@/features/synse-body/providers/standard-ble'
import { useWeighing } from '@/features/synse-body/use-weighing'
import { Button } from '@/components/ui/button'
import type { ScaleCapabilities, ScaleDiagnostic } from '@/features/synse-body/engine/types'
import type { UserDevice } from '@/types/domain'

/**
 * Subir na balança.
 *
 * A tela tem sete estados porque a pesagem tem sete estados. O que ela não faz
 * é fingir que o número já estabilizou: enquanto as leituras discordam entre
 * si, ela diz "fique parado" em vez de mostrar um peso que vai mudar.
 */

const CAMPOS_DA_LEITURA = [
  'bodyFatPercent',
  'muscleMassKg',
  'leanMassKg',
  'bodyWaterPercent',
  'bmrKcal',
  'bmi',
] as const

export function WeighingScreen({
  aparelho,
  heightM,
  modoDemonstracao,
}: {
  aparelho: UserDevice
  heightM: number | null
  modoDemonstracao: boolean
}) {
  const [diagnosticos, setDiagnosticos] = useState<ScaleDiagnostic[]>([])
  const [confirmouPessoa, setConfirmouPessoa] = useState(false)

  /*
   * A balança simulada entra quando não há aparelho de verdade — no modo de
   * demonstração e no aparelho pareado pelo provider `mock`. Nos dois casos a
   * tela é a mesma: quem muda é quem está do outro lado do rádio.
   */
  const provider = useMemo(
    () => (modoDemonstracao || aparelho.provider === 'mock' ? mockScaleProvider : standardBleScaleProvider),
    [modoDemonstracao, aparelho.provider],
  )

  const pesagem = useWeighing({
    provider,
    platformDeviceId: aparelho.platformDeviceId,
    deviceId: aparelho.id,
    capabilities: aparelho.capabilities as unknown as ScaleCapabilities,
    heightM,
    onDiagnostic: (evento) => setDiagnosticos((atuais) => [...atuais.slice(-49), evento]),
  })

  const { estado, medidaPronta } = pesagem
  const medindo = ['AGUARDANDO', 'MEDINDO', 'INSTAVEL'].includes(estado.estado)
  const precisaConfirmar = pesagem.precisaConfirmarPessoa && !confirmouPessoa

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-synse-border bg-synse-surface p-6 text-center">
        <p className="flex items-center justify-center gap-2 text-xs text-synse-muted">
          <Bluetooth className="size-3.5" aria-hidden />
          {aparelho.displayName}
        </p>

        <p
          className="mt-6 text-6xl font-semibold tabular-nums text-synse-text"
          aria-live="polite"
          aria-atomic="true"
        >
          {estado.pesoAtualKg === null ? '—' : estado.pesoAtualKg.toFixed(1)}
          <span className="ml-2 text-2xl font-normal text-synse-muted">kg</span>
        </p>

        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-synse-muted">
          {medindo && estado.estado !== 'AGUARDANDO' && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {estado.estado === 'SINCRONIZANDO' && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {estado.estado === 'CONCLUIDO' && (
            <CheckCircle2 className="size-4 text-synse-success" aria-hidden />
          )}
          {estado.estado === 'ERRO' && (
            <AlertTriangle className="size-4 text-synse-danger" aria-hidden />
          )}
          {TEXTO_DO_ESTADO[estado.estado]}
        </p>

        {estado.erro && <p className="mt-2 text-sm text-synse-danger">{estado.erro}</p>}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {estado.estado === 'AGUARDANDO' && !estado.amostras.length && (
            <Button onClick={() => void pesagem.iniciar()}>
              <Scale className="size-4" aria-hidden />
              Começar a pesagem
            </Button>
          )}

          {estado.estado === 'ESTAVEL' && !precisaConfirmar && (
            <Button onClick={() => void pesagem.confirmarEGravar()}>Salvar medição</Button>
          )}

          {(estado.estado === 'ERRO' || estado.estado === 'CONCLUIDO') && (
            <Button variant="outline" onClick={pesagem.reiniciar}>
              Pesar de novo
            </Button>
          )}
        </div>
      </section>

      {/*
        A balança de família. Ela manda um número de usuário que não tem
        relação nenhuma com as contas do Synse, e adivinhar a pessoa pelo peso
        parecido é exatamente o erro que põe a pesagem de um no histórico do
        outro. Por isso a tela pergunta em vez de deduzir.
      */}
      {estado.estado === 'ESTAVEL' && precisaConfirmar && (
        <section className="rounded-xl border border-synse-warning/40 bg-synse-warning/5 p-5">
          <h2 className="text-sm font-semibold text-synse-text">Quem realizou esta medição?</h2>
          <p className="mt-1 text-sm text-synse-muted">
            Esta balança é usada por mais de uma pessoa. O Synse não adivinha de quem é a pesagem
            pelo peso — confirme antes de salvar no seu histórico.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setConfirmouPessoa(true)
                void pesagem.confirmarEGravar()
              }}
            >
              Fui eu — salvar
            </Button>
            <Button variant="outline" onClick={pesagem.reiniciar}>
              Foi outra pessoa — descartar
            </Button>
          </div>
        </section>
      )}

      {pesagem.pendenteDeSincronizacao && (
        <p className="flex items-center gap-2 rounded-lg border border-synse-border bg-synse-surface px-4 py-3 text-sm text-synse-muted">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Pendente de sincronização. A medição está salva no aparelho e sobe assim que houver rede.
        </p>
      )}

      {pesagem.avisos.map((aviso) => (
        <p
          key={aviso}
          className="flex items-start gap-2 rounded-lg border border-synse-border bg-synse-surface px-4 py-3 text-sm text-synse-muted"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      ))}

      {medidaPronta && (
        <section className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <MeasurementField
              campo="weightKg"
              valor={medidaPronta.weightKg}
              origem={medidaPronta.fieldOrigin.weightKg}
              destaque
            />
          </div>
          {CAMPOS_DA_LEITURA.map((campo) => (
            <MeasurementField
              key={campo}
              campo={campo}
              valor={medidaPronta[campo]}
              origem={medidaPronta.fieldOrigin[campo]}
            />
          ))}
        </section>
      )}

      {/*
        O painel de desenvolvimento. Fica atrás de um `<details>` fechado
        porque ninguém precisa dele para se pesar — e precisa muito dele no dia
        em que uma balança nova não fala, que é quando o pacote cru é a única
        pista que existe.
      */}
      {diagnosticos.length > 0 && (
        <details className="rounded-xl border border-synse-border bg-synse-surface p-4">
          <summary className="cursor-pointer text-xs font-medium text-synse-muted">
            Comunicação com o aparelho ({diagnosticos.length})
          </summary>
          <ul className="mt-3 space-y-1 font-mono text-[11px] text-synse-muted">
            {diagnosticos.map((evento, i) => (
              <li key={`${evento.at}-${i}`} className="break-all">
                <span className="text-synse-text">{evento.kind}</span> {evento.message}
                {evento.detail ? ` ${JSON.stringify(evento.detail)}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
