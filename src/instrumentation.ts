import type { Instrumentation } from 'next'

/**
 * Erro de servidor, capturado no ponto em que o Next o entrega.
 *
 * A tela mostra à pessoa uma referência de oito dígitos e nada mais — é o
 * certo para quem usa. Mas o outro lado dessa referência vive no log da
 * Vercel, e quem opera este produto não abre terminal nem painel de logs.
 * Aqui a referência ganha um par: mesma digest, com rota, mensagem e as
 * primeiras linhas de pilha, legíveis em `/api/health/errors`.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { recordError } = await import('@/lib/observability/recent-errors')
  const { subjectFromCookieHeader } = await import('@/lib/observability/request-subject')

  const erro = error as { message?: unknown; stack?: unknown; digest?: unknown }

  recordError({
    at: new Date().toISOString(),
    path: `${request.path ?? '?'} · ${context.routeType ?? 'route'}`,
    digest: typeof erro.digest === 'string' ? erro.digest : null,
    message: String(erro.message ?? error).slice(0, 500),
    // Três quadros bastam para achar o arquivo; a pilha inteira só faria a
    // resposta pesar e vazar caminho de build.
    frames: String(erro.stack ?? '')
      .split('\n')
      .slice(1, 4)
      .map((linha) => linha.trim().slice(0, 200)),
    // O cabeçalho pode vir repetido; nesse caso o Node entrega um array.
    sub: subjectFromCookieHeader(
      Array.isArray(request.headers?.cookie)
        ? request.headers.cookie.join('; ')
        : (request.headers?.cookie ?? null),
    ),
  })
}
