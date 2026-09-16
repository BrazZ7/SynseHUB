'use client'

import { Bluetooth, Loader2, Pencil, RefreshCw, Signal, Trash2, Wrench } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

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
  const [aviso, setAviso] = useState<string | null>(null)
  /*
   * Se este ambiente lê Bluetooth. Só dá para saber no cliente, depois da
   * montagem: no servidor não existe `navigator`. Começa como `null` — "ainda
   * não sei" — porque assumir que não lê piscaria o aviso em todo celular.
   */
  const [leBluetooth, setLeBluetooth] = useState<boolean | null>(null)

  useEffect(() => {
    let vivo = true
    void provider.isAvailable().then((tem) => {
      if (vivo) setLeBluetooth(tem)
    })
    return () => {
      vivo = false
    }
  }, [provider])

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => void scan.procurar()}
            disabled={scan.varrendo || leBluetooth === false}
          >
            {scan.varrendo ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Procurar
          </Button>
        </div>

        {/*
          O aviso vem antes da tentativa. Num navegador de computador não
          existe Bluetooth, e deixar a pessoa tocar em Procurar para receber
          uma mensagem em inglês é fazê-la descobrir sozinha o que o produto
          já sabia.
        */}
        {leBluetooth === false && (
          <div className="rounded-lg border border-synse-border bg-synse-surface p-4">
            <p className="text-sm font-medium text-synse-text">
              Este navegador não lê Bluetooth
            </p>
            <p className="mt-1 text-sm text-synse-muted">
              A leitura da balança acontece no aplicativo Synse no celular. Aqui você pode
              registrar o peso à mão — o histórico é o mesmo.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/app/corpo/manual">
                <Pencil className="size-4" aria-hidden />
                Digitar peso
              </Link>
            </Button>
          </div>
        )}

        {erro && <p className="text-sm text-synse-danger">{erro}</p>}
        {aviso && <p className="text-sm text-synse-muted">{aviso}</p>}
        {scan.erro && <p className="text-sm text-synse-danger">{scan.erro}</p>}

        {aparelhos.length === 0 ? (
          <EmptyState
            icon={Bluetooth}
            title="Nenhuma balança vinculada"
            description={
              leBluetooth === false
                ? 'Abra o aplicativo Synse no celular para vincular uma balança.'
                : 'Ligue o Bluetooth, suba na balança para acordá-la e toque em Procurar.'
            }
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
                        onClick={() => {
                          setErro(null)
                          setAviso(null)
                          /*
                            Sem o catch a rejeição sobe sem dono e a tela não
                            diz nada — o toque parece não ter feito efeito.
                          */
                          provider
                            .identify(aparelho.platformDeviceId)
                            .then(() => setAviso(`${aparelho.displayName} respondeu.`))
                            .catch((e: unknown) =>
                              setErro(e instanceof Error ? e.message : 'O aparelho não respondeu.'),
                            )
                        }}
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
