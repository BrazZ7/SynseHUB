import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { DevicesScreen } from '@/features/synse-body/components/devices-screen'
import { SincronizacaoDeSaude } from '@/features/synse-body/components/health-sync'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { BodyMeasurement, UserDevice } from '@/types/domain'

export const metadata: Metadata = { title: 'Aparelhos' }

export default async function AparelhosPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  let aparelhos: UserDevice[] = []
  try {
    aparelhos = await dataSource.listUserDevices()
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  /*
   * A altura vem da última avaliação física, como na tela de pesagem. Sem ela
   * o IMC não é calculado — e não é inventado a partir de uma altura média,
   * que produziria um número com cara de dado.
   */
  let alturaM: number | null = null
  try {
    const avaliacoes = await dataSource.listAssessments(session.organizationId, session.studentId)
    const comAltura = [...avaliacoes].reverse().find((a) => a.height != null)
    alturaM = comAltura?.height != null ? comAltura.height / 100 : null
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  /*
   * ── O que a importação precisa saber antes de rodar ──────────────────────
   *
   * A marca d'água decide a janela: sem ela, toda sincronização varreria um
   * ano. O histórico recente é para não trazer de novo a pesagem que já entrou
   * pelo Bluetooth — a mesma balança pode falar com o Synse **e** escrever na
   * plataforma de saúde pelo app do fabricante.
   *
   * Trinta dias de histórico, e não tudo: a janela de conflito tem um minuto,
   * então só as pesagens perto no tempo importam, e as perto no tempo estão no
   * período recente. Carregar o histórico inteiro para comparar um minuto
   * seria pagar caro por nada.
   */
  /*
   * As duas marcas d'água, e não a da plataforma "certa": descobrir a
   * plataforma aqui exigiria ler o user-agent, que num WebView do Capacitor é
   * o do navegador do sistema com um sufixo — adivinhação que erra em algum
   * aparelho e falha de um jeito difícil de reproduzir. Quem sabe onde está
   * rodando é o cliente, que pergunta ao próprio Capacitor. São duas consultas
   * de uma linha cada.
   */
  let marcas = { apple_health: null as string | null, health_connect: null as string | null }
  let recentes: Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'clientId'>[] = []
  try {
    const [apple, connect, pagina] = await Promise.all([
      dataSource.getLastHealthMeasurementAt('APPLE_HEALTH'),
      dataSource.getLastHealthMeasurementAt('HEALTH_CONNECT'),
      dataSource.listBodyMeasurements('30d'),
    ])
    marcas = { apple_health: apple, health_connect: connect }
    recentes = pagina.rows.map(({ measuredAt, weightKg, clientId }) => ({
      measuredAt,
      weightKg,
      clientId,
    }))
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/corpo" label="Synse Body" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Aparelhos</h1>
        <p className="text-sm text-synse-muted">
          As balanças vinculadas à sua conta. Sua academia não vê esta lista.
        </p>
      </header>

      <DevicesScreen aparelhos={aparelhos} modoDemonstracao={dataSource.kind === 'demo'} />

      <SincronizacaoDeSaude marcas={marcas} alturaM={alturaM} jaNoHistorico={recentes} />
    </ColunaDeLeitura>
  )
}
