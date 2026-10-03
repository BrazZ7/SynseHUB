import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RAIZ, montarGrafo, semComentarios } from './grafo-de-importacoes'

/**
 * ── Método do data source que nenhuma tela chama ────────────────────────────
 *
 * Irmão do `action-sem-porta`, e nasceu do mesmo jeito: contando.
 *
 * `listSharedBodyMeasurements` estava na interface, implementado nos dois data
 * sources, com a RLS e a autorização nominal prontas desde a 0032 — e nenhuma
 * tela o chamava. O aluno autorizava o professor a ver o corpo dele, a tela
 * dele dizia "autorizado", e no painel do professor não havia onde olhar.
 *
 * Esse é o pior formato: não é uma funcionalidade faltando, é uma
 * funcionalidade **pela metade**, e a metade que aparece promete a que falta.
 * Nenhum teste de comportamento pega, porque o comportamento de cada peça
 * está certo. Só aparece clicando pela tela e sentindo falta — ou contando.
 *
 * ── Por que a lista de dívida ───────────────────────────────────────────────
 *
 * Ao contar, apareceram cinco. Um era o do corpo e foi ligado; os quatro
 * abaixo continuam sem chamador e estão nomeados porque dívida escrita
 * encolhe, e teste vermelho ignorado não. **Sair daqui é tirar o nome da
 * lista, não acrescentar outro.**
 */
const SEM_CHAMADOR_CONHECIDOS = [
  /*
   * A sessão de treino em andamento vista pelo servidor. A tela do aluno
   * recupera do IndexedDB; falta a do painel — "quem está treinando agora".
   */
  'getActiveWorkoutSession',
  /*
   * Um plano por id. Este é o único que provavelmente é código morto, e não
   * tela faltando: quem precisa do plano já tem a lista em mãos.
   */
  'getPlan',
  /* O histórico de contatos de um lead. O CRM tem lista e cadastro, não tem a ficha. */
  'listLeadEvents',
  /* As dietas anteriores do aluno. A tela mostra só a publicada. */
  'listNutritionPlansForStudent',
].sort()

/** Os data sources: é lá que o método é declarado e implementado, não chamado. */
const ONDE_NAO_CONTA = (arquivo: string) =>
  arquivo === 'src/lib/database/data-source.ts' ||
  arquivo === 'src/lib/database/demo-data-source.ts' ||
  arquivo === 'src/lib/database/supabase-data-source.ts'

function metodosSemChamador(extras: Record<string, string> = {}): string[] {
  const grafo = montarGrafo(extras)

  const interfaceDoDataSource = semComentarios(
    extras['src/lib/database/data-source.ts'] ??
      readFileSync(join(RAIZ, 'src/lib/database/data-source.ts'), 'utf8'),
  )
  const metodos = [
    ...new Set([...interfaceDoDataSource.matchAll(/^ {2}(\w+)\(/gm)].map((m) => m[1])),
  ]

  const orfaos = metodos.filter((metodo) => {
    const citacao = new RegExp(`\\b${metodo}\\b`)
    return ![...grafo.limpo].some(
      ([arquivo, codigo]) =>
        !ONDE_NAO_CONTA(arquivo) && grafo.alcancaveis.has(arquivo) && citacao.test(codigo),
    )
  })

  return orfaos.sort()
}

describe('todo método do data source tem quem o chame', () => {
  it('nenhum método novo sem tela que o use', () => {
    /*
     * Falhou com um nome novo? O método foi escrito, implementado duas vezes
     * e ninguém o alcança. Ligue-o — não acrescente o nome à lista.
     *
     * Falhou com um nome a menos? Alguém ligou um dos antigos: tire o nome,
     * que é a comemoração.
     */
    expect(metodosSemChamador()).toEqual(SEM_CHAMADOR_CONHECIDOS)
  })

  it('e a leitura do corpo pelo professor saiu da lista', () => {
    /*
     * O motivo de este guarda existir. Se um dia esta asserção cair, alguém
     * desligou a ficha do aluno do `listSharedBodyMeasurements` — e o aluno
     * voltou a autorizar um professor que não vê nada.
     */
    expect(metodosSemChamador()).not.toContain('listSharedBodyMeasurements')
  })

  it('e ainda enxerga um método solto quando existe um', () => {
    /*
     * A isca, em memória. Sem ela, um caminhador quebrado que marcasse tudo
     * como alcançável passaria na asserção de cima por omissão — e o guarda
     * seria um teste que não testa.
     */
    const comIsca = metodosSemChamador({
      'src/lib/database/data-source.ts': readFileSync(
        join(RAIZ, 'src/lib/database/data-source.ts'),
        'utf8',
      ).replace('  getPlan(', '  metodoDeMentiraSemChamador(): Promise<void>\n  getPlan('),
    })

    expect(comIsca).toContain('metodoDeMentiraSemChamador')
  })

  it('e não acusa o método que uma página alcança', () => {
    /*
     * O outro lado: ligado a uma rota, o mesmo método sai da lista. Um
     * caminhador que marcasse tudo como órfão passaria no teste anterior e
     * cairia aqui.
     */
    const comIscaLigada = metodosSemChamador({
      'src/lib/database/data-source.ts': readFileSync(
        join(RAIZ, 'src/lib/database/data-source.ts'),
        'utf8',
      ).replace('  getPlan(', '  metodoDeMentiraSemChamador(): Promise<void>\n  getPlan('),
      'src/app/isca/page.tsx':
        "import { getDataSource } from '@/lib/database'\n" +
        'export default async function Pagina() {\n' +
        '  const fonte = await getDataSource()\n' +
        '  return fonte.metodoDeMentiraSemChamador()\n' +
        '}\n',
    })

    expect(comIscaLigada).not.toContain('metodoDeMentiraSemChamador')
  })
})
