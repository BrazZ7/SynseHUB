'use client'

/**
 * Qual aba manda no treino.
 *
 * ── O problema ──────────────────────────────────────────────────────────────
 *
 * O treino gravado no aparelho é um registro só por aluno (`escopo.ts`), e as
 * duas abas abertas no mesmo navegador leem e escrevem o mesmo registro. Cada
 * uma mantém a própria cópia em memória, e cada mudança regrava o registro
 * inteiro: a última a escrever apaga o que a outra havia gravado. A pessoa vê
 * o treino voltar no tempo sem ter desfeito nada.
 *
 * As séries não se perdem — a fila é aditiva e cada série tem `client_id`, e
 * desde a 0059 o número de série ocupado desloca em vez de ser recusado. O que
 * se perde é a confiança: um treino que anda para trás é um treino que a pessoa
 * não vai usar na próxima semana.
 *
 * ── A política ──────────────────────────────────────────────────────────────
 *
 * Uma aba manda; a outra avisa e espera. Quem abre a tela assume o comando e
 * anuncia; quem ouve o anúncio para de gravar e mostra um botão para assumir de
 * volta. Sem disputa, sem adivinhação, e a decisão é sempre de quem está
 * olhando a tela.
 *
 * `BroadcastChannel` e não batimento gravado no IndexedDB: a aba fechada
 * simplesmente para de anunciar, e não sobra tranca pendurada esperando um
 * tempo limite vencer. Onde o `BroadcastChannel` não existe — webview antigo —
 * não há aviso, e o comportamento é o de antes: as duas abas gravam. Está
 * documentado em vez de simulado.
 *
 * A outra metade desta política, a de dois **aparelhos**, é do banco, no
 * cabeçalho da 0059.
 */

/** O anúncio que uma aba faz ao assumir. */
export type AvisoDeComando = {
  tipo: 'assumi'
  dono: string
  aba: string
}

/**
 * Um canal por dono.
 *
 * Duas contas no mesmo navegador não disputam comando: o treino de uma não é o
 * treino da outra, e o registro gravado também é separado.
 */
export function nomeDoCanal(dono: string): string {
  return `synse-treino:${dono}`
}

/**
 * Se este anúncio tira o comando desta aba.
 *
 * Confere de tudo porque o que chega num canal é dado de fora do nosso
 * controle: outra versão do app numa aba velha, uma extensão, um anúncio de
 * formato antigo. Nada disso pode travar a tela de quem está treinando — na
 * dúvida, o comando fica onde está.
 */
export function perdiOComando(aviso: unknown, dono: string, minhaAba: string): boolean {
  if (!aviso || typeof aviso !== 'object') return false
  const dados = aviso as Partial<AvisoDeComando>
  if (dados.tipo !== 'assumi') return false
  if (typeof dados.aba !== 'string' || typeof dados.dono !== 'string') return false
  // O próprio anúncio volta em alguns navegadores; e o de outra conta não é meu
  // assunto.
  if (dados.aba === minhaAba) return false
  return dados.dono === dono
}

export type Comando = {
  /** Assume o comando e avisa as outras abas. */
  anunciar: () => void
  /** Chama de volta quando outra aba assume. */
  ouvir: (aoPerder: () => void) => void
  fechar: () => void
}

/**
 * ── O canal abre quando precisa, e reabre depois de fechado ─────────────────
 *
 * Antes o canal era criado aqui em cima, uma vez, e `fechar()` o deixava
 * inutilizável para sempre. Com `reactStrictMode` — que este projeto liga —
 * o React monta o efeito, desmonta e monta de novo em desenvolvimento: o
 * primeiro desmonte chamava `fechar()`, e como o objeto vem de um `useMemo`
 * por dono, a segunda montagem chamava `anunciar()` no **mesmo canal fechado**.
 *
 * Resultado: `InvalidStateError: Channel is closed` subindo como erro não
 * tratado e derrubando a tela inteira do Treino Ativo para a borda de erro.
 * Só em desenvolvimento — em produção o efeito monta uma vez —, mas isso
 * significava que ninguém conseguia abrir o Treino Ativo na própria máquina,
 * e foi o que impediu de conferir o resumo do treino no navegador.
 *
 * Abrir sob demanda resolve sem mudar a política: assumir o comando passa a
 * funcionar sempre que for chamado, que é o que o nome promete.
 */
export function criarComando(dono: string, minhaAba: string): Comando {
  if (typeof BroadcastChannel === 'undefined') {
    return { anunciar: () => {}, ouvir: () => {}, fechar: () => {} }
  }

  let canal: BroadcastChannel | null = null
  /*
   * Guardado fora do canal porque o canal morre e nasce: quem registrou o
   * ouvinte uma vez continua ouvindo depois de uma reabertura, sem precisar
   * chamar `ouvir` de novo.
   */
  let aoPerderOComando: (() => void) | null = null

  function abrir(): BroadcastChannel {
    if (canal) return canal
    canal = new BroadcastChannel(nomeDoCanal(dono))
    canal.onmessage = (evento) => {
      if (aoPerderOComando && perdiOComando(evento.data, dono, minhaAba)) aoPerderOComando()
    }
    return canal
  }

  return {
    anunciar: () => {
      const aviso: AvisoDeComando = { tipo: 'assumi', dono, aba: minhaAba }
      abrir().postMessage(aviso)
    },
    ouvir: (aoPerder) => {
      aoPerderOComando = aoPerder
      abrir()
    },
    fechar: () => {
      canal?.close()
      canal = null
    },
  }
}
