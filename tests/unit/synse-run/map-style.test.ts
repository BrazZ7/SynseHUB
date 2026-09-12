import { describe, expect, it } from 'vitest'

import { BASEMAP_LIST, resolveBasemap, tileSource } from '@/features/synse-run/map-style'

describe('estilo do mapa', () => {
  it('sem escolha, o mapa escuro', () => {
    expect(resolveBasemap(null).id).toBe('noturno')
    expect(resolveBasemap(undefined).id).toBe('noturno')
  })

  it('a escolha da pessoa vence o padrão', () => {
    expect(resolveBasemap('detalhado').id).toBe('detalhado')
    expect(resolveBasemap('suave').id).toBe('suave')
  })

  it('valor salvo que não existe mais volta ao padrão em vez de quebrar', () => {
    // O identificador vive no `localStorage` do celular: uma versão futura que
    // renomeie um estilo encontra o nome antigo salvo lá por meses.
    expect(resolveBasemap('cinza-2024').id).toBe('noturno')
    expect(resolveBasemap('').id).toBe('noturno')
  })

  it('só o estilo detalhado mostra o mapa sem filtro', () => {
    for (const opcao of BASEMAP_LIST) {
      if (opcao.id === 'detalhado') expect(opcao.filtro).toBe('none')
      else expect(opcao.filtro).not.toBe('none')
    }
  })

  it('cada estilo declara cor de rota, halo e contorno', () => {
    for (const opcao of BASEMAP_LIST) {
      expect(opcao.rota).toMatch(/^#[0-9a-f]{6}$/)
      expect(opcao.contorno).toMatch(/^#[0-9a-f]{6}$/)
      expect(opcao.halo.cor).toMatch(/^#[0-9a-f]{6}$/)
      // O halo existe para contornar a linha: mais estreito, ele apareceria
      // como uma segunda rota desalinhada em vez de um contorno.
      expect(opcao.halo.espessura).toBeGreaterThan(opcao.espessura)
      expect(opcao.halo.opacidade).toBeGreaterThan(0)
      expect(opcao.halo.opacidade).toBeLessThanOrEqual(1)
    }
  })
})

describe('fornecedor de azulejos', () => {
  it('sem configuração, OpenStreetMap', () => {
    const fonte = tileSource({})
    expect(fonte.url).toContain('tile.openstreetmap.org')
    expect(fonte.maxZoom).toBe(19)
  })

  it('uma variável de ambiente troca o fornecedor inteiro', () => {
    const fonte = tileSource({
      url: 'https://api.maptiler.com/maps/x/{z}/{x}/{y}.png?key=k',
      attribution: '© MapTiler © OpenStreetMap',
      maxZoom: '22',
    })
    expect(fonte.url).toContain('maptiler')
    expect(fonte.attribution).toBe('© MapTiler © OpenStreetMap')
    expect(fonte.maxZoom).toBe(22)
  })

  it('URL em branco não deixa o mapa sem azulejo', () => {
    expect(tileSource({ url: '   ' }).url).toContain('openstreetmap')
  })

  it('zoom inválido cai no padrão, e a atribuição nunca fica vazia', () => {
    const fonte = tileSource({ url: 'https://t/{z}/{x}/{y}.png', maxZoom: 'muito', attribution: ' ' })
    expect(fonte.maxZoom).toBe(19)
    expect(fonte.attribution).toBeTruthy()
  })
})
