/**
 * ── A escala de um eixo ─────────────────────────────────────────────────────
 *
 * O eixo vinha com `domain={['dataMin - 2', 'dataMax + 2']}`, e as marcas
 * saíam do dado cru: **53,45 · 48,1 · 42,1 · 36,1 · 30,1**. Número de eixo
 * existe para a pessoa localizar o valor de relance, e para isso ele precisa
 * ser redondo — ninguém procura "42,1 kg" num gráfico.
 *
 * E havia um segundo defeito no mesmo lugar: `± 2` é uma folga fixa. No peso,
 * que varia de 93,5 a 94,2 em quatro meses, ela abre um eixo de 91 a 96 e põe
 * a linha reta no meio de uma caixa vazia. A folga tem de ser proporcional à
 * variação, não um número.
 *
 * ── O algoritmo ─────────────────────────────────────────────────────────────
 *
 * O "1-2-5": o passo entre marcas é sempre 1, 2 ou 5 vezes uma potência de
 * dez. É o que faz 0 · 25 · 50 · 75 · 100 parecer natural e 0 · 23 · 46 não.
 */

export type Escala = {
  /** O mínimo do eixo, já redondo. */
  min: number
  /** O máximo do eixo, já redondo. */
  max: number
  /** As marcas, incluindo as duas pontas. */
  marcas: number[]
}

/**
 * O passo redondo **mais próximo** de `bruto`, na família 1 · 2 · 5 · 10.
 *
 * Os cortes são 1,5 · 3 · 7, e não 1 · 2 · 5: arredondar sempre para cima faz
 * um passo de 6,4 virar 10, e aí o eixo de uma carga que vai de 30 a 51 abre
 * em 20–60 com um terço vazio embaixo. Mais próximo em escala logarítmica —
 * 6,4 está mais perto de 5 (×1,28) do que de 10 (×1,56).
 */
function passoRedondo(bruto: number): number {
  if (bruto <= 0) return 1
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const normalizado = bruto / potencia

  if (normalizado < 1.5) return potencia
  if (normalizado < 3) return 2 * potencia
  if (normalizado < 7) return 5 * potencia
  return 10 * potencia
}

/**
 * Uma escala de marcas redondas que cobre os valores.
 *
 * `alvoDeMarcas` é alvo, não promessa: o arredondamento do passo pode devolver
 * uma marca a mais ou a menos, e forçar o número exato desfaria o passo
 * redondo — que é o ponto.
 *
 * ── A folga, e uma correção de rota ─────────────────────────────────────────
 *
 * Comecei querendo apertar o eixo do peso: 93,5 a 94,2 em quatro meses
 * desenhava uma linha reta no meio de uma caixa vazia, e isso me pareceu
 * desperdício. Está errado. Linha achatada **é** a verdade quando a variação é
 * pequena — e apertar o eixo até ela subir de ponta a ponta é a forma clássica
 * de mentir com gráfico: 700 gramas de oscilação viram uma montanha.
 *
 * Então a folga tem **piso proporcional ao valor**, 2%, e não só 10% da
 * variação. Num peso de 94 kg isso abre uns 2 kg para cada lado, e a mudança
 * de 700g aparece do tamanho que ela tem.
 *
 * ── O zero ──────────────────────────────────────────────────────────────────
 *
 * Série que nunca é negativa não ganha eixo negativo: volume de treino não
 * desce de zero, e "-5.000 kg" numa marca é uma quantidade que não existe.
 */
export function escalaAgradavel(valores: number[], alvoDeMarcas = 4): Escala {
  if (valores.length === 0) return { min: 0, max: 1, marcas: [0, 1] }

  const menor = Math.min(...valores)
  const maior = Math.max(...valores)
  const variacao = maior - menor
  const tudoPositivo = menor >= 0

  const folga = Math.max(variacao * 0.1, Math.abs(maior) * 0.02) || 1
  const passo = passoRedondo((variacao + folga * 2) / Math.max(1, alvoDeMarcas))

  const pisoBruto = tudoPositivo ? Math.max(0, menor - folga) : menor - folga
  const min = Math.floor(pisoBruto / passo) * passo
  const max = Math.ceil((maior + folga) / passo) * passo

  const marcas: number[] = []
  /*
   * O acumulador soma o passo em vez de multiplicar o índice: somar `0.1`
   * dez vezes dá 0.9999999999999999 em ponto flutuante, e a marca sairia
   * como "0,9999999999999999". O arredondamento abaixo desfaz o acúmulo.
   */
  const casas = Math.max(0, -Math.floor(Math.log10(passo)))
  for (let v = min; v <= max + passo / 2; v += passo) {
    marcas.push(Number(v.toFixed(casas)))
  }

  return { min, max, marcas }
}
