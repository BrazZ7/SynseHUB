import { describe, expect, it } from 'vitest'

import {
  estiloDoFio,
  FIOS,
  gradienteDoFio,
} from '@/features/nutrition/components/fios-da-cachoeira'

/**
 * A cachoeira do quadro das refeições.
 *
 * Arte não costuma dar teste, mas aqui há uma invariante que quebra em
 * silêncio: a volta da animação desloca o fio em `--ladrilho`, e o degradê se
 * repete a cada `ladrilho`. Enquanto os dois forem o mesmo número, o último
 * quadro do ciclo é idêntico ao primeiro e a emenda não existe. Separe os dois
 * e a água passa a saltar uma vez por volta — nada quebra, nada avisa, e só
 * quem olhar fixo por alguns segundos percebe.
 */
describe('os fios da cachoeira', () => {
  it('fecham o degradê exatamente no ladrilho, que é o passo da volta', () => {
    for (const fio of FIOS) {
      const ultimaParada = gradienteDoFio(fio).match(/(\d+)px\)$/)?.[1]
      expect(ultimaParada, `fio em ${fio.x}`).toBe(String(fio.ladrilho))
    }
  })

  it('mantêm a gota dentro do ladrilho, para a parte acesa não vazar na emenda', () => {
    for (const fio of FIOS) {
      expect(fio.gota, `fio em ${fio.x}`).toBeLessThan(fio.ladrilho)
      expect(Math.round(fio.gota / 2), `pico do fio em ${fio.x}`).toBeLessThan(fio.gota)
    }
  })

  it('não repetem posição, que é a chave de lista do React', () => {
    expect(new Set(FIOS.map((fio) => fio.x)).size).toBe(FIOS.length)
  })

  /*
   * Fios com a mesma duração voltam a se alinhar a cada volta e descem em
   * formação — o que lê como cortina, não como água. Durações distintas não
   * garantem o contrário sozinhas, mas duas iguais garantem o problema.
   */
  it('não repetem duração, para não caírem em bloco', () => {
    expect(new Set(FIOS.map((fio) => fio.dur)).size).toBe(FIOS.length)
  })

  it('declaram brilho dentro da faixa de opacidade', () => {
    for (const fio of FIOS) {
      expect(fio.brilho, `fio em ${fio.x}`).toBeGreaterThan(0)
      expect(fio.brilho, `fio em ${fio.x}`).toBeLessThanOrEqual(1)
    }
  })
})

/*
 * Os dois números que precisam concordar são `--ladrilho`, o passo da volta da
 * animação, e o fim do degradê. O componente não monta nenhum dos dois: ele
 * espalha o que sai de `estiloDoFio`, e é esse objeto — o que de fato vai para
 * o atributo `style` — que este teste lê.
 */
describe('o estilo que vai para a tela', () => {
  it('usa o mesmo passo na volta da animação e na repetição do degradê', () => {
    for (const fio of FIOS) {
      const estilo = estiloDoFio(fio) as Record<string, string>
      const fimDoDegrade = estilo.backgroundImage.match(/(\d+)px\)$/)?.[1]

      expect(estilo['--ladrilho'], `fio em ${fio.x}`).toBe(`${fimDoDegrade}px`)
    }
  })

  it('sobe o fio um ladrilho inteiro acima da calha, e o estica na mesma medida', () => {
    for (const fio of FIOS) {
      const estilo = estiloDoFio(fio) as Record<string, string>

      expect(estilo.top, `fio em ${fio.x}`).toBe(`-${fio.ladrilho}px`)
      expect(estilo.height, `fio em ${fio.x}`).toBe(`calc(100% + ${fio.ladrilho}px)`)
    }
  })

  /*
   * `--pressa` é o que o toque e o mouse mexem. Se a duração virar valor fixo,
   * a água para de responder — e nada no desenho denuncia isso.
   */
  it('deixa a duração passar por --pressa, para o toque poder apressar a queda', () => {
    for (const fio of FIOS) {
      const estilo = estiloDoFio(fio) as Record<string, string>

      expect(estilo['--queda'], `fio em ${fio.x}`).toBe(`calc(${fio.dur} * var(--pressa, 1))`)
      expect(estilo.animationDuration, `fio em ${fio.x}`).toBeUndefined()
    }
  })
})
