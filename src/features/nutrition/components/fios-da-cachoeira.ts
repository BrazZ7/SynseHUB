import type { CSSProperties } from 'react'

/**
 * Os fios da cachoeira, e o estilo inteiro de cada um.
 *
 * Fica fora do componente porque aqui há uma invariante que dá para testar, e
 * que quebra **em silêncio**: o degradê precisa se fechar exatamente em
 * `ladrilho`, que é o mesmo deslocamento de uma volta da animação. Enquanto os
 * dois forem iguais, o último quadro do ciclo é pixel a pixel igual ao
 * primeiro e a emenda não existe. Se alguém mexer num e esquecer do outro, a
 * água passa a dar um salto por volta — nada quebra, nada avisa, e o defeito
 * só aparece para quem olhar fixo por alguns segundos.
 */
export type FioDaCachoeira = {
  /** Posição horizontal na calha. É também a chave de lista: não pode repetir. */
  x: string
  largura: number
  /** Opacidade do ponto mais aceso, de 0 a 1. */
  brilho: number
  /** De quantos em quantos pixels o desenho se repete. */
  ladrilho: number
  /** Comprimento da parte acesa dentro do ladrilho. Menor que ele, sempre. */
  gota: number
  dur: string
  atraso: string
}

/*
 * Nada é sorteado: `Math.random` no servidor e no navegador dão valores
 * diferentes, e o React reclamaria da hidratação a cada carregamento — é a
 * mesma razão pela qual as folhas do vale do SynseRun têm coordenadas fixas.
 *
 * Ladrilho grande com gota pequena é pingo esparso; ladrilho pequeno com gota
 * grande é jorro contínuo. Os tempos são primos entre si o suficiente para os
 * fios não voltarem a se alinhar em poucos segundos: fio em formação lê como
 * cortina, não como água.
 */
export const FIOS: readonly FioDaCachoeira[] = [
  { x: '13%', largura: 2, brilho: 0.5, ladrilho: 190, gota: 54, dur: '2.6s', atraso: '0s' },
  { x: '27%', largura: 3, brilho: 0.72, ladrilho: 250, gota: 96, dur: '3.4s', atraso: '0.7s' },
  { x: '40%', largura: 1.5, brilho: 0.4, ladrilho: 150, gota: 38, dur: '2.1s', atraso: '1.4s' },
  { x: '51%', largura: 4, brilho: 0.85, ladrilho: 310, gota: 130, dur: '4.1s', atraso: '0.2s' },
  { x: '65%', largura: 2, brilho: 0.55, ladrilho: 210, gota: 62, dur: '2.9s', atraso: '1.9s' },
  { x: '77%', largura: 2.5, brilho: 0.62, ladrilho: 270, gota: 84, dur: '3.7s', atraso: '1.1s' },
  { x: '87%', largura: 1.5, brilho: 0.34, ladrilho: 170, gota: 44, dur: '2.4s', atraso: '2.3s' },
]

/*
 * O quadro força `.dark`, então `--synse-mint` é sempre `#9fe9d5` aqui. O
 * valor vai direto porque `color-mix` dentro de valor arbitrário do Tailwind
 * fica ilegível, e a cor não varia com o tema nesta superfície.
 */
export const MINT = '159,233,213'

/** O fio: apagado, aceso no meio da gota, apagado, e vazio até fechar o ladrilho. */
export function gradienteDoFio(fio: FioDaCachoeira): string {
  const pico = Math.round(fio.gota / 2)
  return [
    'repeating-linear-gradient(to bottom',
    `rgba(${MINT},0) 0px`,
    `rgba(${MINT},${fio.brilho}) ${pico}px`,
    `rgba(${MINT},0) ${fio.gota}px`,
    `rgba(${MINT},0) ${fio.ladrilho}px)`,
  ].join(', ')
}

/**
 * O estilo inteiro do fio, num lugar só.
 *
 * O componente só espalha o que sai daqui, e não é zelo: o passo da volta
 * (`--ladrilho`) e o passo do degradê **precisam** ser o mesmo número, e eles
 * ficariam em arquivos diferentes se o componente montasse metade. Saindo os
 * dois da mesma função, divergir deixa de ser possível por descuido — e o
 * teste confere o valor que de fato vai para a tela.
 *
 * `--queda`, e não `animationDuration`: estilo em linha venceria a folha de
 * estilos, e aí o toque não conseguiria apressar nada. A variável é lida pelo
 * atalho que o Tailwind gera, e `--pressa` multiplica por fora.
 *
 * O elemento começa um ladrilho **acima** da calha e vai até o pé dela, senão
 * a primeira volta abre uma faixa vazia no topo.
 */
export function estiloDoFio(fio: FioDaCachoeira): CSSProperties {
  return {
    left: fio.x,
    width: `${fio.largura}px`,
    top: `${-fio.ladrilho}px`,
    height: `calc(100% + ${fio.ladrilho}px)`,
    animationDelay: fio.atraso,
    backgroundImage: gradienteDoFio(fio),
    ['--ladrilho' as string]: `${fio.ladrilho}px`,
    ['--queda' as string]: `calc(${fio.dur} * var(--pressa, 1))`,
  } as CSSProperties
}
