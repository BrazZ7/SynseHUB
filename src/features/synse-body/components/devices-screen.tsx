'use client'

import { Bluetooth, Loader2, RefreshCw, Signal, Trash2, Wrench } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/synse/empty-state'
import { pairDeviceAction, renameDeviceAction, unpairDeviceAction } from '@/features/synse-body/actions'
import { mockScaleProvider } from '@/features/synse-body/providers/mock'
import { standardBleScaleProvider } from '@/features/synse-body/providers/standard-ble'
import { useScaleScan } from '@/features/synse-body/use-weighing'
import type { UserDevice } from '@/types/domain'

/**
 * Os aparelhos da pessoa.
 *
 * O pareamento lê os serviços de verdade antes de gravar: `capabilities` é o
 * que aquele aparelho comprovadamente entregou na conversa, e não o que o
 * fabricante promete na caixa. É essa diferença que evita a tela prometer
 * gordura corporal numa balança que só sabe pesar.
 */

export function DevicesScreen({
  aparelhos,
  modoDemonstracao,
}: {
  aparelhos: UserDevice[]
  modoDemonstracao: boolean
}) {
  const router = useRouter()
  const provider = modoDemonstracao ? mockScaleProvider : standardBleScaleProvider
  const scan = useScaleScan(provider)
  const [salvando, iniciarTransicao] = useTransition()
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function parear(platformDeviceId: string, nome: string | null) {
    setErro(null)
    try {
      await provider.connect(platformDeviceId)
      /*
       * Descobrir antes de gravar. Um pareamento que não conversou com o
       * aparelho gravaria uma linha sem saber se aquilo é sequer uma balança.
       */
      const capacidades = await provider.getCapabilities(platformDeviceId)
      await provider.disconnect(platformDeviceId)

      const resposta = await pairDeviceAction({
        platformDeviceId,
        displayName: nome?.trim() || 'Balança',
        provider: provider.id,
        protocol: capacidades.bodyComposition ? 'BLE_BODY_COMPOSITION' : 'BLE_WEIGHT_SCALE',
        capabilities: capacidades as unknown as Record<string, boolean>,
      })

      if (resposta.status === 'error') {
        setErro(resposta.message)
        return
      }
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível conversar com este aparelho.')
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-synse-text">Aparelhos vinculados</h2>
          <Button size="sm" variant="outline" onClick={() => void scan.procurar()} disabled={scan.varrendo}>
            {scan.varrendo ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Procurar
          </Button>
        </div>

        {erro && <p className="text-sm text-synse-danger">{erro}</p>}
        {scan.erro && <p className="text-sm text-synse-danger">{scan.erro}</p>}

        {aparelhos.length === 0 ? (
          <EmptyState
            icon={Bluetooth}
            title="Nenhuma balança vinculada"
            description="Ligue o Bluetooth, suba na balança para acordá-la e toque em Procurar."
          />
        ) : (
          <ul className="space-y-3">
            {aparelhos.map((aparelho) => (
              <li
                key={aparelho.id}
                className="rounded-xl border border-synse-border bg-synse-surface p-4"
              >
                {renomeando === aparelho.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(evento) => {
                      evento.preventDefault()
                      iniciarTransicao(async () => {
                        await renameDeviceAction(aparelho.id, novoNome)
                        setRenomeando(null)
                        router.refresh()
                      })
                    }}
                  >
                    <Input
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      maxLength={80}
                      aria-label="Novo nome do aparelho"
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={salvando}>
                      Salvar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenomeando(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <>
                    <p className="font-medium text-synse-text">{aparelho.displayName}</p>
                    <p className="mt-0.5 text-xs text-synse-muted">
                      {[aparelho.manufacturer, aparelho.model].filter(Boolean).join(' · ') ||
                        'Fabricante não informado'}
                      {aparelho.firmwareVersion ? ` · firmware ${aparelho.firmwareVersion}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-synse-muted">
                      {aparelho.lastSeenAt
                        ? `Visto pela última vez em ${new Date(aparelho.lastSeenAt).toLocaleDateString('pt-BR')}`
                        : 'Ainda não enviou nenhuma pesagem'}
                    </p>

                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(aparelho.capabilities)
                        .filter(([, ligado]) => ligado === true)
                        .map(([nome]) => (
                          <li
                            key={nome}
                            className="rounded bg-synse-bg px-2 py-0.5 font-mono text-[10px] text-synse-muted"
                          >
                            {nome}
                          </li>
                        ))}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void provider.identify(aparelho.platformDeviceId)}
                      >
                        <Signal className="size-4" aria-hidden />
                        Identificar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenomeando(aparelho.id)
                          setNovoNome(aparelho.displayName)
                        }}
                      >
                        <Wrench className="size-4" aria-hidden />
                        Renomear
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          iniciarTransicao(async () => {
                            await unpairDeviceAction(aparelho.id)
                            router.refresh()
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Desvincular
                      </Button>
                    </div>
                    {/*
                      Desvincular não apaga pesagem. O histórico é da pessoa, e
                      o vínculo com o aparelho é só a explicação de onde cada
                      número veio.
                    */}
                    <p className="mt-2 text-[11px] text-synse-muted">
                      Desvincular mantém todas as suas medições no histórico.
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {scan.encontrados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-synse-text">Encontrados por perto</h2>
          <ul className="space-y-2">
            {scan.encontrados
              .filter(
                (achado) =>
                  !aparelhos.some((a) => a.platformDeviceId === achado.platformDeviceId),
              )
              .map((achado) => (
                <li
                  key={achado.platformDeviceId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-synse-border bg-synse-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-synse-text">{achado.name ?? 'Sem nome'}</p>
                    <p className="font-mono text-[11px] text-synse-muted">
                      {achado.rssi === null ? 'sinal desconhecido' : `${achado.rssi} dBm`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void parear(achado.platformDeviceId, achado.name)}>
                    Vincular
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
