import type { CapacitorConfig } from '@capacitor/cli'

/**
 * O invólucro nativo do Synse App.
 *
 * ── Por que `server.url` e não um bundle ─────────────────────────────────────
 *
 * O projeto é Next.js com App Router, RSC e Server Actions. Empacotar os
 * arquivos dentro do app exigiria `output: 'export'`, que desliga exatamente
 * isso — as telas do aluno buscam dados no servidor a cada render, e as
 * escritas passam por server actions. Não é preferência: exportar estático
 * significaria reescrever o produto.
 *
 * Com `server.url`, o invólucro carrega a aplicação publicada e ganha o que
 * importa do nativo: Live Activity, notificação persistente, GPS em segundo
 * plano e haptics. A correção de um texto sai no mesmo dia, sem passar por
 * revisão de loja.
 *
 * **O risco que isso traz, e que precisa de resposta:** a diretriz 4.2 da Apple
 * recusa app que é só um site embrulhado. A resposta do Synse não é retórica —
 * são as Live Activities, a Dynamic Island, o cronômetro de descanso na tela
 * bloqueada e o GPS do SynseRun, que nenhum site faz. O plugin de
 * `native/synse-workout-activity` existe para isso, e é ele que precisa estar
 * funcionando antes da primeira submissão.
 *
 * ── `androidScheme: 'https'` ─────────────────────────────────────────────────
 *
 * Sem isso o WebView do Android serve em `http://localhost`, e o contexto deixa
 * de ser seguro: Geolocation, Wake Lock e Notification simplesmente não
 * existem. Seria descobrir no aparelho que o SynseRun não pega GPS.
 */
const config: CapacitorConfig = {
  appId: 'br.com.synse.app',
  appName: 'Synse',
  /*
   * Com `server.url` o conteúdo vem da rede; `mobile/www` guarda só a tela de
   * falha de conexão, apontada por `server.errorPath` logo abaixo.
   */
  webDir: 'mobile/www',
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? 'https://synse.com.br',
    androidScheme: 'https',
    iosScheme: 'https',
    /*
     * Apenas o domínio próprio navega dentro do app. Link para outro lugar abre
     * no navegador do sistema — é o que impede uma página externa de rodar com
     * as permissões que o usuário concedeu ao Synse.
     */
    allowNavigation: ['synse.com.br', 'www.synse.com.br'],
    /*
     * A tela de quando o aparelho não alcança o servidor.
     *
     * Sem isto, celular sem rede abre o app na página de erro do navegador —
     * em inglês, com o endereço exposto, e com cara de aplicativo quebrado. O
     * arquivo mora em `mobile/www/index.html`, que é por isso que `webDir`
     * aponta para lá.
     *
     * No Android essa página **não** tem acesso a plugin do Capacitor, então
     * ela não pode depender de nada além de HTML e JavaScript comum.
     */
    errorPath: 'index.html',
  },
  ios: {
    contentInset: 'always',
    /** A tela do app é escura; fundo claro pisca branco a cada abertura. */
    backgroundColor: '#041D1B',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: '#041D1B',
    /*
     * Tráfego em claro continua proibido. A aplicação é HTTPS; permitir seria
     * abrir a porta para interceptação em rede de academia compartilhada.
     */
    allowMixedContent: false,
  },
  plugins: {
    /*
     * A splash some quando a aplicação avisa que desenhou. Tempo fixo mostraria
     * tela branca em rede lenta, ou esconderia a splash antes da hora numa rede
     * boa.
     */
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#041D1B',
      androidSplashResourceName: 'splash',
    },
  },
}

export default config
