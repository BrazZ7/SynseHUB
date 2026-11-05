/*
 * ── O service worker do Synse ────────────────────────────────────────────────
 *
 * Existe por um motivo só: receber push e mostrar o aviso quando o app está
 * fechado. Não faz cache de nada — offline é outro problema, com outras
 * armadilhas, e misturar os dois faria este arquivo servir página velha sem
 * ninguém pedir.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  /*
   * Payload ilegível não pode virar aviso em branco: o navegador mostraria
   * uma notificação vazia com o nome do site, que assusta mais do que informa.
   * Sem título, não mostra nada.
   */
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    return
  }
  if (!dados.titulo) return

  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo ?? '',
      // Os arquivos que existem de verdade em `public/brand`. Caminho errado
      // aqui não dá erro: o aviso sai sem imagem, e ninguém descobre por quê.
      icon: '/brand/icon-192.png',
      /*
       * `tag` junta avisos da mesma natureza: três lembretes de treino viram
       * um. Sem isso a pessoa acorda com a tela cheia de Synse e desliga tudo.
       */
      tag: dados.tag ?? 'synse',
      data: { url: dados.url ?? '/app' },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = evento.notification.data?.url ?? '/app'

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      /*
       * Se o app já está aberto, leva aquela aba para o destino em vez de
       * abrir outra. Quem clica num aviso quer chegar num lugar, não colecionar
       * abas do mesmo site.
       */
      for (const janela of janelas) {
        if (janela.url.includes(self.location.origin)) {
          return janela.focus().then((j) => (j.navigate ? j.navigate(destino) : j))
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
