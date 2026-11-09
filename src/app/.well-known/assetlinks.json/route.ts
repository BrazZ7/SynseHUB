import { NextResponse } from 'next/server'

import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Digital Asset Links — o que faz um link do Synse abrir no app.
 *
 * Sem este arquivo, `https://synse.com.br/app/corpo` mandado no WhatsApp abre
 * no navegador, e a pessoa que tem o app instalado cai numa versão sem Live
 * Activity, sem GPS em segundo plano e sem balança. Com ele, o Android verifica
 * que o dono do domínio autoriza aquele aplicativo e passa a entregar o link
 * direto ao app.
 *
 * A verificação é dos dois lados: o manifesto declara o domínio com
 * `autoVerify`, e o domínio declara o app aqui. Um lado só não vale.
 *
 * ── A impressão digital ──────────────────────────────────────────────────────
 *
 * É o SHA-256 do certificado que **assina o APK que chega ao aparelho**. Quando
 * a Play Console assina por você (App Signing, o padrão hoje), a digital certa
 * é a que ela mostra — não a da sua chave de upload. Trocar as duas é o erro
 * mais comum, e o sintoma é silencioso: o link simplesmente continua abrindo no
 * navegador.
 *
 * Aceita mais de uma, separadas por vírgula, porque em geral há duas: a de
 * produção e a de teste interno.
 */
const APP_ID = env(process.env.NEXT_PUBLIC_ANDROID_APP_ID, 'br.com.synse.app')

function digitais(): string[] {
  return env(process.env.ANDROID_CERT_FINGERPRINTS, '')
    .split(',')
    .map((valor) => valor.trim().toUpperCase())
    .filter(Boolean)
}

export async function GET() {
  const fingerprints = digitais()

  /*
   * Sem digital configurada, 404 — e não um arquivo vazio.
   *
   * Um `assetlinks.json` sintaticamente válido e sem digital nenhuma faz o
   * Android concluir que o domínio **nega** o app, e ele passa a recusar a
   * verificação com um erro que não diz isso. Ausente é honesto: a verificação
   * fica pendente, que é a verdade.
   */
  if (!fingerprints.length) {
    return new NextResponse('assetlinks não configurado', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: APP_ID,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    {
      headers: {
        'content-type': 'application/json',
        // O Android relê de tempos em tempos; um dia de cache não atrapalha.
        'cache-control': 'public, max-age=86400',
      },
    },
  )
}
