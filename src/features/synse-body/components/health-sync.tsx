'use client'

import { AlertCircle, Check, HeartPulse, Loader2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { importHealthMeasurementsAction } from '@/features/synse-body/actions'
import {
  ROTULO_DA_FONTE,
  SOURCE_DA_FONTE,
  type FonteDeSaudeId,
} from '@/features/synse-body/health/amostra'
import { janelaParaLer, planejarImportacao } from '@/features/synse-body/health/importar'
import {
  type Disponibilidade,
  comoAmostra,
  fonteDaPlataforma,
  pluginDeSaude,
} from '@/features/synse-body/health/ponte'
import { LOTE_MAXIMO_DE_IMPORTACAO } from '@/lib/validations/body'
import type { BodyMeasurement } from '@/types/domain'

/**
 * Trazer o peso do Apple Saúde ou do Health Connect.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * A maior parte das balanças de mercado fala protocolo proprietário e nunca
 * vai conversar por Bluetooth com o Synse. Mas quase todas escrevem no Apple
 * Saúde ou no Health Connect pelo app do próprio fabricante — e ali o formato
 * é padronizado. Esta tela é o caminho de uma Xiaomi, de uma Withings ou de
 * uma Renpho entrarem no Synse sem uma linha de código de fabricante.
 *
 * ── Os dois estados que a tela precisa distinguir ───────────────────────────
 *
 * "Não autorizado" e "autorizado mas vazio" são coisas diferentes, e no iOS o
 * sistema **não deixa saber qual é**: o HealthKit não revela negativa de
 * leitura, para que um app não deduza uma condição de saúde pelo que a pessoa
 * escondeu. Por isso, quando a plataforma não é taxativa, o texto do vazio
 * oferece conferir no Saúde em vez de afirmar que não há pesagem.
 */

type Estado =
  | { fase: 'VERIFICANDO' }
  | { fase: 'INDISPONIVEL'; motivo: Disponibilidade['reason'] }
  | { fase: 'PRONTO' }
  | { fase: 'IMPORTANDO'; passo: string }
  | {
      fase: 'CONCLUIDO'
      gravadas: number
      jaExistiam: number
      recusadas: number
      atingiuOTeto: boolean
      avisos: string[]
      taxativo: boolean
    }
  | { fase: 'ERRO'; mensagem: string }

export function SincronizacaoDeSaude({
  marcas,
  alturaM,
  jaNoHistorico,
}: {
  /**
   * A pesagem mais recente já vinda de cada plataforma. Define a janela.
   *
   * As duas, e não só a desta plataforma, porque quem sabe onde o app está
   * rodando é o cliente — o servidor teria de adivinhar pelo user-agent.
   */
  marcas: Record<FonteDeSaudeId, string | null>
  alturaM: number | null
  /** O histórico recente, para não trazer o que já entrou pelo Bluetooth. */
  jaNoHistorico: Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'clientId'>[]
}) {
  const router = useRouter()
  const [fonte, setFonte] = useState<FonteDeSaudeId | null>(null)
  const [estado, setEstado] = useState<Estado>({ fase: 'VERIFICANDO' })

  useEffect(() => {
    let vivo = true
    const plugin = pluginDeSaude()

    if (!plugin) {
      /*
       * Navegador. Nem o Apple Saúde nem o Health Connect têm API web — são
       * dados guardados no aparelho, e nenhuma das duas plataformas os expõe a
       * uma página. Não é algo que mais código resolva.
       */
      setEstado({ fase: 'INDISPONIVEL', motivo: 'UNSUPPORTED_PLATFORM' })
      return
    }

    void plugin
      .isAvailable()
      .then((resposta) => {
        if (!vivo) return
        setFonte(resposta.provider ?? fonteDaPlataforma())
        setEstado(
          resposta.available
            ? { fase: 'PRONTO' }
            : { fase: 'INDISPONIVEL', motivo: resposta.reason },
        )
      })
      .catch(() => {
        if (vivo) setEstado({ fase: 'INDISPONIVEL', motivo: 'UNSUPPORTED_PLATFORM' })
      })

    return () => {
      vivo = false
    }
  }, [])

  const importar = useCallback(async () => {
    const plugin = pluginDeSaude()
    const qual = fonte ?? fonteDaPlataforma()
    if (!plugin || !qual) return

    try {
      setEstado({ fase: 'IMPORTANDO', passo: 'Pedindo acesso…' })
      const permissao = await plugin.requestPermissions()
      if (!permissao.granted) {
        setEstado({
          fase: 'ERRO',
          mensagem: `O acesso ao ${ROTULO_DA_FONTE[qual]} não foi concedido.`,
        })
        return
      }

      setEstado({ fase: 'IMPORTANDO', passo: 'Lendo suas pesagens…' })
      const janela = janelaParaLer({ ultimaImportadaEm: marcas[qual], agora: new Date() })
      const { samples } = await plugin.readSamples({
        from: janela.from,
        to: janela.to,
        limit: janela.limit,
      })

      const plano = planejarImportacao({
        amostras: samples.map(comoAmostra),
        fonte: qual,
        alturaM,
        jaNoHistorico,
      })

      if (plano.aEnviar.length === 0) {
        setEstado({
          fase: 'CONCLUIDO',
          gravadas: 0,
          jaExistiam: plano.jaExistiam,
          recusadas: 0,
          atingiuOTeto: plano.atingiuOTeto,
          avisos: plano.avisos,
          taxativo: permissao.authoritative,
        })
        return
      }

      /*
       * Em fatias, porque o schema do servidor tem teto por chamada. Uma fatia
       * que falhe não perde as anteriores — e reenviar não duplica, porque o
       * `clientId` é estável.
       */
      let gravadas = 0
      let recusadas = 0
      for (let i = 0; i < plano.aEnviar.length; i += LOTE_MAXIMO_DE_IMPORTACAO) {
        const fatia = plano.aEnviar.slice(i, i + LOTE_MAXIMO_DE_IMPORTACAO)
        setEstado({
          fase: 'IMPORTANDO',
          passo: `Salvando ${i + fatia.length} de ${plano.aEnviar.length}…`,
        })

        const resposta = await importHealthMeasurementsAction({
          source: SOURCE_DA_FONTE[qual],
          measurements: fatia,
        })

        if (resposta.status === 'error') {
          setEstado({ fase: 'ERRO', mensagem: resposta.message })
          return
        }
        gravadas += resposta.gravadas
        recusadas += resposta.recusadas
      }

      setEstado({
        fase: 'CONCLUIDO',
        gravadas,
        jaExistiam: plano.jaExistiam,
        recusadas,
        atingiuOTeto: plano.atingiuOTeto,
        avisos: plano.avisos,
        taxativo: permissao.authoritative,
      })
      router.refresh()
    } catch (erro) {
      setEstado({
        fase: 'ERRO',
        mensagem: erro instanceof Error ? erro.message : 'Não foi possível importar.',
      })
    }
  }, [alturaM, fonte, jaNoHistorico, marcas, router])

  const nome = fonte ? ROTULO_DA_FONTE[fonte] : 'Apple Saúde ou Health Connect'

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-synse-mint/50 text-synse-primary"
        >
          <HeartPulse className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-synse-text">{nome}</h2>
          <p className="mt-0.5 text-xs text-synse-muted">
            Traz o peso e a composição corporal que a sua balança já escreve lá — inclusive de
            marcas que não falam Bluetooth com o Synse.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {estado.fase === 'VERIFICANDO' && <p className="text-xs text-synse-muted">Verificando…</p>}

        {estado.fase === 'INDISPONIVEL' && <Indisponivel motivo={estado.motivo} />}

        {estado.fase === 'PRONTO' && (
          <Button size="sm" onClick={() => void importar()}>
            <RefreshCw className="size-4" aria-hidden />
            {fonte && marcas[fonte] ? 'Sincronizar agora' : 'Conectar e importar'}
          </Button>
        )}

        {estado.fase === 'IMPORTANDO' && (
          <p className="flex items-center gap-2 text-xs text-synse-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {estado.passo}
          </p>
        )}

        {estado.fase === 'CONCLUIDO' && (
          <Concluido estado={estado} nome={nome} aoRepetir={() => void importar()} />
        )}

        {estado.fase === 'ERRO' && (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-xs text-synse-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {estado.mensagem}
            </p>
            <Button size="sm" variant="outline" onClick={() => void importar()}>
              Tentar de novo
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function Indisponivel({ motivo }: { motivo: Disponibilidade['reason'] }) {
  if (motivo === 'NEEDS_INSTALL') {
    return (
      <p className="text-xs text-synse-muted">
        O Health Connect é um aplicativo à parte no Android. Instale-o pela Play Store e volte aqui.
      </p>
    )
  }

  if (motivo === 'NO_HEALTH_DATA') {
    return <p className="text-xs text-synse-muted">Este aparelho não tem o aplicativo Saúde.</p>
  }

  /*
   * O caso do navegador, que é a maioria dos acessos hoje. O texto diz **por
   * que** não dá, e não só que não dá: sem isso a pessoa fica tentando de
   * outro navegador atrás de uma coisa que não existe em nenhum.
   */
  return (
    <p className="text-xs text-synse-muted">
      Disponível no aplicativo do Synse, no celular. O Apple Saúde e o Health Connect guardam os
      dados dentro do aparelho e não têm acesso pelo navegador.
    </p>
  )
}

function Concluido({
  estado,
  nome,
  aoRepetir,
}: {
  estado: Extract<Estado, { fase: 'CONCLUIDO' }>
  nome: string
  aoRepetir: () => void
}) {
  const nada = estado.gravadas === 0 && estado.jaExistiam === 0

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 text-xs text-synse-text">
        <Check className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
        <span>
          {estado.gravadas > 0 && (
            <>
              <strong className="font-medium">
                {estado.gravadas} {estado.gravadas === 1 ? 'pesagem nova' : 'pesagens novas'}
              </strong>
              {estado.jaExistiam > 0 && `, e ${estado.jaExistiam} que já estavam aqui`}.
            </>
          )}

          {/*
            "Importamos 0" soa como falha. Dizer que já estavam aqui é o que
            transforma o zero em confirmação de que funcionou.
          */}
          {estado.gravadas === 0 && estado.jaExistiam > 0 && (
            <>Tudo em dia: as {estado.jaExistiam} pesagens do período já estavam aqui.</>
          )}

          {nada &&
            (estado.taxativo
              ? `Nenhuma pesagem encontrada no ${nome} neste período.`
              : /*
                 No iOS, vazio é ambíguo entre "negou o acesso" e "não tem
                 dado" — o HealthKit não deixa saber qual. Afirmar que não há
                 pesagem seria dizer uma coisa que o app não sabe.
                 */
                `Nada veio do ${nome}. Se você tem pesagens lá, confira no aplicativo Saúde se o Synse está autorizado a ler peso.`)}
        </span>
      </p>

      {estado.recusadas > 0 && (
        <p className="text-xs text-synse-muted">
          {estado.recusadas} {estado.recusadas === 1 ? 'pesagem não pôde' : 'pesagens não puderam'}{' '}
          ser salva{estado.recusadas === 1 ? '' : 's'}.
        </p>
      )}

      {estado.atingiuOTeto && (
        <p className="text-xs text-synse-muted">
          Havia mais pesagens do que cabe numa importação. Sincronize de novo para continuar de onde
          parou.
        </p>
      )}

      {estado.avisos.map((aviso) => (
        <p key={aviso} className="text-xs text-synse-muted">
          {aviso}
        </p>
      ))}

      <Button size="sm" variant="outline" onClick={aoRepetir}>
        <RefreshCw className="size-4" aria-hidden />
        Sincronizar de novo
      </Button>
    </div>
  )
}
