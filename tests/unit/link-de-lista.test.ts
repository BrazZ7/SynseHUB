import { readFileSync } from 'node:fs'

import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

/**
 * ── Linha de lista não usa `<Link>` ──────────────────────────────────────────
 *
 * O `<Link>` do Next busca no servidor **todo elo que entra na tela**. Numa
 * lista de cinquenta linhas isso são cinquenta pedidos que ninguém pediu, e em
 * produção cada um paga `supabase.auth.getUser()` mais a leitura do perfil
 * antes de renderizar — duas idas à rede por pedido especulativo, competindo
 * com o clique que a pessoa de fato deu.
 *
 * `ListLink` existe para isso: não busca nada por entrar na tela, e aquece
 * quando o ponteiro chega em cima ou o dedo encosta.
 *
 * ── Por que um teste, e não só cuidado ──────────────────────────────────────
 *
 * Porque a regressão é invisível. Medido no navegador contra o build de
 * produção, `/avaliações` disparava 37 pedidos ao abrir — 26 deles fichas de
 * aluno e formulários de avaliação que ninguém tinha pedido. A tela parecia
 * perfeita. A primeira rodada deste trabalho arrumou três telas; as outras
 * seis passaram meses assim sem ninguém notar, porque não há sintoma até a
 * academia com quatrocentos alunos abrir a lista no 4G.
 *
 * ── O que conta como linha de lista ─────────────────────────────────────────
 *
 * Um `<Link>` dentro de um `.map(...)` cujo endereço **interpola no caminho**:
 * `/students/${aluno.id}` é uma tela por linha, e é o caso caro.
 *
 * Interpolação só na consulta — `/reports?dias=${opcao}` — não conta, e a
 * distinção não é preguiça: é a mesma rota, então o Next reaproveita a mesma
 * carga, e esses elos costumam ser botões de filtro que a pessoa vai clicar.
 * Buscar esses antes é o que o `<Link>` faz de bom.
 */

/** O corpo de `.map(`, achado por casamento de parênteses. */
function corpoDoMap(fonte: string, inicio: number): string {
  let profundidade = 0
  for (let i = inicio; i < fonte.length; i += 1) {
    if (fonte[i] === '(') profundidade += 1
    else if (fonte[i] === ')') {
      profundidade -= 1
      if (profundidade === 0) return fonte.slice(inicio, i + 1)
    }
  }
  return fonte.slice(inicio)
}

/** `href={`/students/${x}`}` com interpolação antes de qualquer `?`. */
const HREF_COM_CAMINHO_VARIAVEL = /<Link\b[^>]*?href=\{`([^`]*)`\}/gs

function linhasDeLista(fonte: string): string[] {
  const achados: string[] = []

  for (const m of fonte.matchAll(/\.map\(/g)) {
    const corpo = corpoDoMap(fonte, m.index + '.map'.length)

    for (const elo of corpo.matchAll(HREF_COM_CAMINHO_VARIAVEL)) {
      const endereco = elo[1]
      const caminho = endereco.split('?')[0]
      if (caminho.includes('${')) achados.push(endereco)
    }
  }

  return achados
}

describe('elo de linha de lista', () => {
  it('usa ListLink, e não o <Link> que busca tudo de uma vez', async () => {
    const arquivos = await fg(['src/app/**/*.tsx', 'src/features/**/*.tsx'], {
      cwd: process.cwd(),
      absolute: true,
    })

    const infratores: string[] = []
    for (const arquivo of arquivos) {
      for (const endereco of linhasDeLista(readFileSync(arquivo, 'utf8'))) {
        infratores.push(`${arquivo.replace(`${process.cwd()}/`, '')} → ${endereco}`)
      }
    }

    expect(infratores).toEqual([])
  })
})
