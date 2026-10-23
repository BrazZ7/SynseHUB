/**
 * ── O servidor sabe que está sendo aberto de dentro do app? ──────────────────
 *
 * O Synse é um site, e o aplicativo é uma janela que carrega esse mesmo site
 * (`server.url` em `capacitor.config.ts`). Para as lojas, porém, os dois são
 * mundos diferentes: o que pode aparecer na web é proibido dentro do app. Sem
 * distinguir um do outro, não há como cumprir a regra sem mutilar a web.
 *
 * ── Por que User-Agent, e não algo melhor ───────────────────────────────────
 *
 * Numa navegação de topo — que é toda navegação aqui, porque o app carrega
 * páginas e não faz chamadas de API para montá-las — a WebView não deixa
 * acrescentar cabeçalho. Cookie exigiria uma primeira visita para plantá-lo e
 * se perde quando o aparelho limpa dados. Parâmetro na URL vale só para a
 * primeira navegação.
 *
 * O User-Agent é o único sinal que chega em **toda** requisição, inclusive nas
 * de RSC. O Capacitor o acrescenta nativamente com `appendUserAgent`.
 *
 * ── Isto não é controle de acesso ────────────────────────────────────────────
 *
 * E a distinção é importante o suficiente para estar aqui em cima, porque
 * alguém vai olhar esta função daqui a um ano e pensar que é.
 *
 * O User-Agent é escolhido pelo cliente: qualquer pessoa consegue mentir. O que
 * salva não é a confiança no sinal, é a direção em que mentir leva:
 *
 *   - mentir "sou o app" estando na web → vê **menos** coisa (sem compra). Não
 *     há ganho em fazer isso, e nenhum prejuízo para nós;
 *   - mentir "sou a web" estando no app → veria o botão de compra. É a pessoa
 *     escondendo da loja dela mesma, com o aparelho dela.
 *
 * O que a regra das lojas cobra é que **o app publicado** não ofereça compra
 * por fora — e isso o `appendUserAgent` do binário garante. Então nunca use
 * esta função para decidir permissão, acesso a dado ou qualquer coisa que a
 * RLS deveria decidir. Ela decide o que a tela mostra, e nada além.
 */

/**
 * A marca no User-Agent. **Tem de ser igual** ao `appendUserAgent` de
 * `capacitor.config.ts` — há teste que confere os dois, porque divergir aqui
 * faz o app publicado ser tratado como navegador e mostrar o botão de compra
 * que a loja proíbe. Esse defeito não aparece em nenhum teste de tela: aparece
 * na revisão da App Store.
 */
export const MARCA_DO_APP = 'SynseApp'

/** Função pura, para testar sem requisição. */
export function ehAppNativo(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return userAgent.includes(MARCA_DO_APP)
}
