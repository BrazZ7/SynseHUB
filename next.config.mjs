/**
 * ── A política de conteúdo ───────────────────────────────────────────────────
 *
 * Medido em produção antes de escrever: o site mandava `X-Frame-Options`,
 * `nosniff`, `Referrer-Policy` e `Permissions-Policy`, e **nenhuma CSP**.
 *
 * ── O que ela protege de verdade, e o que não ──────────────────────────────
 *
 * Esta CSP não é a mais apertada possível, e é importante dizer onde ela cede
 * em vez de deixar parecer que cobre tudo.
 *
 * `script-src` precisa de `'unsafe-inline'`: o Next injeta scripts embutidos
 * para hidratar a página. A alternativa é nonce por requisição, gerado no
 * middleware — dá para fazer, mas acrescenta trabalho a cada requisição
 * justamente onde acabei de tirar, e o ganho é marginal enquanto não houver
 * `dangerouslySetInnerHTML` em lugar nenhum (não há; é verificado).
 *
 * Mesmo cedendo aí, o que sobra vale:
 *
 * - `frame-ancestors 'none'` fecha clickjacking, e fecha melhor que o
 *   `X-Frame-Options` que já existia — este só entende "mesma origem".
 * - `base-uri 'self'` impede injeção de `<base>`, que sequestra **toda** URL
 *   relativa da página de uma vez.
 * - `form-action 'self'` impede que um formulário injetado poste a senha de
 *   alguém em outro servidor.
 * - `connect-src` limita para onde o navegador pode mandar dado: é a porta de
 *   saída que um XSS usaria para exfiltrar.
 * - `object-src 'none'` fecha plugin, que é superfície antiga e inútil aqui.
 * - `script-src 'self' 'unsafe-inline'` ainda barra **carregar script de
 *   outro domínio**, que é como a maioria dos ataques reais entrega carga.
 *
 * ── Por que `img-src` aceita qualquer https ────────────────────────────────
 *
 * Porque o produto aceita. A capa de um conteúdo, a foto de uma receita e os
 * azulejos do mapa (`NEXT_PUBLIC_MAP_TILE_URL`, configurável) são endereços
 * que uma pessoa digita. Apertar aqui quebraria a funcionalidade sem fechar
 * ataque nenhum: imagem não executa código, e `script-src` continua fechado.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // O Tailwind e o Leaflet escrevem estilo embutido; sem isto a tela fica nua.
  "style-src 'self' 'unsafe-inline'",
  // Fontes são nossas, em `public/fonts` — nada do Google aqui.
  "font-src 'self'",
  "img-src 'self' data: blob: https:",
  // Supabase para dado e arquivo; `wss:` para o canal de tempo real.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Servidor autocontido para container. Fica atrás de uma variável porque
   * `next start` não funciona com `output: 'standalone'` — quem roda o projeto
   * localmente continua usando `npm run build && npm start` normalmente, e o
   * Dockerfile liga a flag para gerar `.next/standalone`.
   */
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  /*
   * ── O cache de rota do cliente ────────────────────────────────────────────
   *
   * Por padrão o Next 15 guarda uma tela dinâmica por **zero** segundo: voltar
   * da ficha do aluno para a lista refaz a lista inteira no servidor, com a
   * sessão sendo resolvida de novo contra o Supabase. Numa academia isso é o
   * gesto mais repetido do dia — abre o aluno, volta, abre o próximo.
   *
   * Trinta segundos é o compromisso. Dado de academia não muda a cada segundo,
   * e o que muda por ação nossa não fica velho: toda escrita chama
   * `revalidatePath`, que limpa a rota afetada na hora. O que sobra de risco é
   * ver por até meio minuto uma lista sem a alteração que **outra pessoa**
   * fez na mesma academia — e isso a tela já tinha, porque ninguém recarrega
   * sozinho.
   *
   * O `static` é mais folgado porque tela sem dado de sessão pode esperar.
   */
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: CSP },
          /*
           * Isola o contexto de janela. Sem isto, uma página aberta por nós
           * (ou que nos abra) compartilha o `window.opener`, que é o caminho
           * do tabnabbing — e o checkout do Mercado Pago abre em outra aba.
           */
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
