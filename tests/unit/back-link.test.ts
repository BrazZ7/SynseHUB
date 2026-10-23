import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Nenhuma tela pode ser um beco sem saída.
 *
 * Vale para o aplicativo do aluno e para o painel da academia. A regra é a
 * mesma nos dois: se a tela não é um destino que a navegação alcança sozinha,
 * ela precisa oferecer o caminho de volta. Sem isso sobra a seta do navegador
 * — que num produto instalado na tela inicial simplesmente não existe.
 *
 * O painel entrou nesta verificação depois, e por um motivo concreto: ele
 * repetia um botão de voltar escrito à mão em cada tela, duas ficaram sem
 * nenhum, e nada acusou.
 *
 * As listas de destino vêm das próprias barras e da configuração de navegação,
 * nunca de uma cópia aqui: destino novo deixa de exigir o botão sozinho, e
 * tela nova fora deles passa a exigir.
 */

function hrefsDe(arquivo: string): string[] {
  return [...readFileSync(arquivo, 'utf8').matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1])
}

const RAIZES_APP = new Set(hrefsDe('src/components/synse/app-bottom-navigation.tsx'))

/*
 * No painel, "alcançável" é mais amplo que a barra inferior: a gaveta lista a
 * navegação inteira e abre de qualquer tela. Quem está na gaveta tem volta;
 * quem não está, não tem.
 */
const RAIZES_HUB = new Set([
  ...hrefsDe('src/components/synse/hub-bottom-navigation.tsx'),
  ...hrefsDe('src/config/navigation.ts'),
])

function telas(dir: string, encontradas: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) telas(caminho, encontradas)
    else if (entrada.name === 'page.tsx') encontradas.push(caminho)
  }
  return encontradas
}

/** 'src/app/(student)/app/challenges/page.tsx' → '/app/challenges' */
function rota(caminho: string, grupo: string): string {
  return caminho
    .replace(grupo, '')
    .replace('/page.tsx', '')
    .replace(/\/\([^)]+\)/g, '')
}

const doAluno = telas('src/app/(student)')
const doPainel = telas('src/app/(hub)')

describe('Synse App', () => {
  it('a barra inferior tem destinos, senão este teste não olha para nada', () => {
    expect(RAIZES_APP.size).toBeGreaterThan(3)
    expect(doAluno.length).toBeGreaterThan(RAIZES_APP.size)
  })

  it.each(doAluno)('%s permite voltar sem usar o navegador', (caminho) => {
    if (RAIZES_APP.has(rota(caminho, 'src/app/(student)'))) return

    /*
     * Procura o uso, não o import: a primeira versão deste teste aceitava o
     * `import` sozinho, e passou com o componente removido da tela. Teste que
     * não falha quando deveria é pior que teste nenhum — dá confiança falsa.
     */
    expect(
      readFileSync(caminho, 'utf8'),
      `${rota(caminho, 'src/app/(student)')} não está na barra inferior e não renderiza <BackLink>`,
    ).toMatch(/<BackLink\b/)
  })
})

describe('painel da academia', () => {
  it('a navegação tem destinos, senão este teste não olha para nada', () => {
    expect(RAIZES_HUB.size).toBeGreaterThan(10)
    expect(doPainel.length).toBeGreaterThan(3)
  })

  it('a barra inferior do painel só leva a lugares que existem', () => {
    // Um destino digitado errado na barra vira um 404 no rodapé de todas as
    // telas do celular, e ninguém percebe até tocar.
    const rotas = new Set(doPainel.map((caminho) => rota(caminho, 'src/app/(hub)')))
    for (const href of hrefsDe('src/components/synse/hub-bottom-navigation.tsx')) {
      expect(rotas, `a barra inferior aponta para ${href}, que não é uma tela`).toContain(href)
    }
  })

  it.each(doPainel)('%s permite voltar sem usar o navegador', (caminho) => {
    if (RAIZES_HUB.has(rota(caminho, 'src/app/(hub)'))) return

    expect(
      readFileSync(caminho, 'utf8'),
      `${rota(caminho, 'src/app/(hub)')} não está na navegação e não renderiza <BackLink>`,
    ).toMatch(/<BackLink\b/)
  })
})
