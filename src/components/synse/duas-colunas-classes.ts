/**
 * ── Duas colunas no tablet: as classes ───────────────────────────────────────
 *
 * Módulo puro, sem JSX, e isto é de propósito: é o que permite que um teste
 * importe estas classes e confira as regras que a técnica exige. O Vitest
 * deste projeto não transforma JSX, então o que mora no `.tsx` ao lado não é
 * testável — e o que não é testável aqui é justamente o que quebra só no
 * navegador, numa largura que ninguém abre todo dia.
 *
 * O componente que usa tudo isto, e o porquê de cada decisão, estão em
 * `duas-colunas.tsx`.
 */

/**
 * A pilha: uma coluna no telefone, duas a partir do tablet.
 *
 * Escrita por extenso de propósito. O Tailwind varre o código-fonte como
 * texto para saber que classes gerar; classe montada em pedaço —
 * `` `[&>*]:${espaco}` `` — não aparece na varredura, e o CSS correspondente
 * simplesmente não existe no arquivo final. O layout quebraria só no
 * navegador, com o código parecendo certo.
 *
 * As três partes, e o que cada uma impede:
 *
 * - `md:columns-2 md:gap-5` — a divisão, só a partir do tablet.
 * - `[&>*]:mb-5` — o espaçamento. **Não** `space-y-5`: aquele põe margem no
 *   topo de todo filho menos o primeiro *do DOM*, e o primeiro cartão da
 *   segunda coluna não é o primeiro do DOM. Ele manteria a margem e a segunda
 *   coluna começaria desalinhada.
 * - `[&>*]:break-inside-avoid` — sem isso o navegador parte um cartão no pé de
 *   uma coluna e continua no alto da outra.
 */
export const CLASSES_DA_PILHA = 'md:columns-2 md:gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid'

/**
 * Um bloco que atravessa as duas colunas.
 *
 * `column-span: all` só vale em filho direto do contêiner multi-coluna.
 */
export const CLASSES_DA_LINHA_INTEIRA = 'md:[column-span:all]'

/**
 * A largura de quem está lendo ou preenchendo, numa coluna só.
 *
 * 42rem é a mesma conta das duas colunas aplicada a uma: o limite de ~75
 * caracteres por linha é **por coluna de leitura**, não pela largura da casca.
 */
export const CLASSES_DA_LEITURA = 'mx-auto w-full max-w-2xl'

/**
 * Uma lista de itens iguais, lado a lado a partir do tablet.
 *
 * É para as páginas de **catálogo** — conteúdos, receitas, programas,
 * atividades, aulas do dia —, onde a divisão não é da página inteira e sim da
 * lista que ela mostra.
 *
 * Aqui é grade, e não coluna de CSS como na pilha, porque o caso é o oposto:
 * os itens têm todos mais ou menos a mesma altura, e a grade mantém o
 * alinhamento das linhas — que numa lista do mesmo tipo de coisa é o que se
 * espera ver. A coluna de CSS, em troca de equilibrar alturas, desalinharia
 * cartões gêmeos.
 *
 * `md:space-y-0` não é decoração: sem ele o `space-y-*` do celular continuaria
 * somando margem dentro da grade, e as linhas abririam um vão a mais.
 */
export const GRADE_DE_ITENS = 'md:grid md:grid-cols-2 md:gap-3 md:space-y-0'
