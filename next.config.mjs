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
        ],
      },
    ]
  },
}

export default nextConfig
