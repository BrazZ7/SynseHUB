'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { novoClientId } from '@/features/synse-body/engine/dedup'
import type {
  DiscoveredScale,
  ParsedScaleReading,
  ScaleCapabilities,
  ScaleDeviceProvider,
  ScaleDiagnostic,
} from '@/features/synse-body/engine/types'
import {
  CONFIG_PADRAO,
  ESTADO_INICIAL,
  type WeighingSnapshot,
  weighingReducer,
} from '@/features/synse-body/engine/weighing-machine'
import { enfileirar } from '@/features/synse-body/storage/local-measurements'
import { enviarAgora } from '@/features/synse-body/sync'
import type { BodyMeasurement } from '@/types/domain'

/**
 * A pesagem, do rádio até o banco.
 *
 * O `useReducer` do React não serve aqui porque a máquina precisa de um pulso
 * de tempo — o silêncio depois da última leitura é o que fecha a pesagem numa
 * balança que manda uma notificação só. O intervalo abaixo é esse pulso.
 */

export type UseWeighingOptions = {
  provider: ScaleDeviceProvider
  /** O aparelho já pareado. */
  platformDeviceId: string
  deviceId: string | null
  capabilities?: ScaleCapabilities | null
  /** Altura do perfil, em metros. Sem ela não há IMC calculado. */
  heightM?: number | null
  onDiagnostic?: (evento: ScaleDiagnostic) => void
}

export type WeighingController = {
  estado: WeighingSnapshot
  /** Precisa perguntar de quem é a medição antes de gravar? */
  precisaConfirmarPessoa: boolean
  pendenteDeSincronizacao: boolean
  medidaPronta: BodyMeasurement | null
  avisos: string[]
  iniciar: () => Promise<void>
  parar: () => void
  confirmarEGravar: () => Promise<void>
  reiniciar: () => void
}

export function useWeighing(options: UseWeighingOptions): WeighingController {
  const [estado, setEstado] = useState<WeighingSnapshot>(ESTADO_INICIAL)
  const [medidaPronta, setMedidaPronta] = useState<BodyMeasurement | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [pendente, setPendente] = useState(false)

  const cancelarRef = useRef<(() => void) | null>(null)
  const clientIdRef = useRef<string>(novoClientId())

  const despachar = useCallback(
    (evento: Parameters<typeof weighingReducer>[1]) =>
      setEstado((atual) => weighingReducer(atual, evento, CONFIG_PADRAO)),
    [],
  )

  /*
   * Uma balança com vários usuários cadastrados é, quase sempre, uma balança
   * de família. Ela manda o número do usuário dela, que não tem relação
   * nenhuma com as contas do Synse — e adivinhar a pessoa pelo peso parecido é
   * exatamente o erro que faz a pesagem de um entrar no histórico do outro.
   * Quando há essa dúvida, a tela pergunta.
   */
  const precisaConfirmarPessoa = useMemo(
    () =>
      options.capabilities?.multipleUsers === true ||
      estado.leituraFinal?.scaleUserId !== undefined,
    [options.capabilities, estado.leituraFinal],
  )

  // O pulso de tempo que fecha a pesagem no silêncio e estoura no timeout.
  useEffect(() => {
    if (!['AGUARDANDO', 'MEDINDO', 'INSTAVEL'].includes(estado.estado)) return

    const intervalo = setInterval(() => despachar({ tipo: 'TEMPO', em: Date.now() }), 250)
    return () => clearInterval(intervalo)
  }, [estado.estado, despachar])

  const parar = useCallback(() => {
    cancelarRef.current?.()
    cancelarRef.current = null
    void options.provider.disconnect(options.platformDeviceId)
  }, [options.provider, options.platformDeviceId])

  const iniciar = useCallback(async () => {
    clientIdRef.current = novoClientId()
    setMedidaPronta(null)
    setAvisos([])
    setPendente(false)
    despachar({ tipo: 'INICIAR', em: Date.now() })

    const permissao = await options.provider.requestPermissions()
    if (!permissao.granted) {
      despachar({ tipo: 'FALHA', mensagem: permissao.message })
      return
    }

    try {
      await options.provider.connect(options.platformDeviceId)
      options.onDiagnostic?.({ at: Date.now(), kind: 'CONNECT', message: 'Conectado' })

      cancelarRef.current = await options.provider.subscribeToMeasurements(
        options.platformDeviceId,
        (leitura: ParsedScaleReading) => {
          options.onDiagnostic?.({
            at: Date.now(),
            kind: 'NOTIFY',
            message: leitura.rawHex,
            detail: { pesoKg: leitura.weightKg ?? null, continua: leitura.continues },
          })
          despachar({ tipo: 'LEITURA', leitura, em: Date.now() })
        },
      )
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Não foi possível falar com a balança.'
      options.onDiagnostic?.({ at: Date.now(), kind: 'ERROR', message: mensagem })
      despachar({ tipo: 'FALHA', mensagem })
    }
  }, [options, despachar])

  /**
   * Grava.
   *
   * A ordem importa: enfileira no aparelho **antes** de tentar a rede. Se o
   * app morrer no meio do envio, a pesagem já está guardada e sobe na próxima
   * abertura. Ao contrário, ela sumiria.
   */
  const confirmarEGravar = useCallback(async () => {
    if (!estado.leituraFinal) return

    const normalizada = options.provider.normalizeMeasurement(estado.leituraFinal, {
      clientId: clientIdRef.current,
      heightM: options.heightM ?? null,
      deviceId: options.deviceId,
      source: 'BLUETOOTH_SCALE',
    })

    if (!normalizada.ok) {
      despachar({ tipo: 'FALHA', mensagem: normalizada.message })
      return
    }

    setAvisos(normalizada.warnings)
    despachar({ tipo: 'SINCRONIZAR' })

    await enfileirar(normalizada.measurement)
    const resposta = await enviarAgora(normalizada.measurement)

    if (resposta.ok) {
      setMedidaPronta({ ...normalizada.measurement, id: resposta.id })
      despachar({ tipo: 'SINCRONIZADO', medida: { ...normalizada.measurement, id: resposta.id } })
      parar()
      return
    }

    /*
     * A rede falhou, a pesagem não. Ela está na fila e a tela diz isso — dizer
     * "erro" faria a pessoa subir na balança de novo para gravar duas vezes a
     * mesma medição.
     */
    setPendente(true)
    setMedidaPronta(normalizada.measurement)
    despachar({ tipo: 'SINCRONIZADO', medida: normalizada.measurement })
    parar()
  }, [estado.leituraFinal, options, despachar, parar])

  const reiniciar = useCallback(() => {
    setMedidaPronta(null)
    setAvisos([])
    setPendente(false)
    despachar({ tipo: 'REINICIAR' })
  }, [despachar])

  // Sair da tela solta o rádio: conexão BLE aberta drena bateria dos dois lados.
  useEffect(() => () => parar(), [parar])

  return {
    estado,
    precisaConfirmarPessoa,
    pendenteDeSincronizacao: pendente,
    medidaPronta,
    avisos,
    iniciar,
    parar,
    confirmarEGravar,
    reiniciar,
  }
}

/** Varredura com estado, para a tela de pareamento. */
export function useScaleScan(provider: ScaleDeviceProvider) {
  const [encontrados, setEncontrados] = useState<DiscoveredScale[]>([])
  const [varrendo, setVarrendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<ScaleDiagnostic[]>([])

  const procurar = useCallback(async () => {
    setErro(null)
    setEncontrados([])
    setVarrendo(true)

    const permissao = await provider.requestPermissions()
    if (!permissao.granted) {
      setErro(permissao.message)
      setVarrendo(false)
      return
    }

    try {
      const achados = await provider.scan({
        // Dez segundos: tempo de a pessoa subir na balança e ela acordar o rádio.
        timeoutMs: 10_000,
        onlyScales: true,
        onDiscover: (aparelho) =>
          setEncontrados((atuais) =>
            atuais.some((a) => a.platformDeviceId === aparelho.platformDeviceId)
              ? atuais
              : [...atuais, aparelho],
          ),
        onDiagnostic: (evento) => setDiagnosticos((atuais) => [...atuais.slice(-99), evento]),
      })
      setEncontrados(achados)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A varredura falhou.')
    } finally {
      setVarrendo(false)
    }
  }, [provider])

  return { encontrados, varrendo, erro, diagnosticos, procurar }
}
