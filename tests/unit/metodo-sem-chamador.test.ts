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
 * Ao contar, apareceram cinco, e **todos saíram**:
 * `listSharedBodyMeasurements`, com as pesagens na ficha do aluno;
 * `listLeadEvents`, com a ficha do lead; `getActiveWorkoutSession`, com o selo
 * "Treinando agora"; `listNutritionPlansForStudent`, com o histórico de
 * dietas; e `getPlan`, que saiu por outro caminho — vide abaixo.
 *
 * Vazia, a lista muda de papel: deixa de registrar dívida e passa a ser um
 * piso. Método novo na interface sem tela que o alcance derruba a suíte no
 * commit em que aparecer, que é quando custa mais barato resolver.
 *
 * ── O que uma entrada aqui significa, e o que não significa ─────────────────
 *
 * Significa "está na interface e nenhuma tela alcança". **Não** significa
 * "ninguém usa": a busca exclui os próprios data sources, então chamada
 * interna (`this.getPlan(...)`) é invisível para ela, de propósito.
 *
 * Isso tem duas saídas, e eu só enxerguei a primeira até errar com a segunda:
 * ligar o método a uma tela, ou tirá-lo do contrato. `getPlan` era o segundo
 * caso — usada duas vezes dentro do data source do Supabase para montar a
 * matrícula com o preço certo. Eu a chamei de código morto num relatório e
 * quase a apaguei; ela virou `private`, e a demonstração parou de precisar
 * implementar uma função que nunca chamava.
 */
const SEM_CHAMADOR_CONHECIDOS: string[] = []

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

  it('e as que já saíram não voltam', () => {
    /*
     * O motivo de este guarda existir, nos casos que ele já resolveu. Se a
     * primeira cair, alguém desligou as pesagens da ficha do aluno — e o
     * aluno voltou a autorizar um professor que não vê nada. Se a segunda
     * cair, a ficha do lead perdeu a linha do tempo. Se a terceira cair, a
     * academia voltou a não saber quem está no salão. Se a última cair, o
     * nutricionista perdeu o que prescreveu antes.
     */
    const orfaos = metodosSemChamador()
    expect(orfaos).not.toContain('listSharedBodyMeasurements')
    expect(orfaos).not.toContain('listLeadEvents')
    expect(orfaos).not.toContain('getActiveWorkoutSession')
    expect(orfaos).not.toContain('listActiveWorkoutSessions')
    expect(orfaos).not.toContain('listNutritionPlansForStudent')
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
      ).replace('  listPlans(', '  metodoDeMentiraSemChamador(): Promise<void>\n  listPlans('),
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
      ).replace('  listPlans(', '  metodoDeMentiraSemChamador(): Promise<void>\n  listPlans('),
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
