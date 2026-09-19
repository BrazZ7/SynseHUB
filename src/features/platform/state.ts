/** Constantes e tipos do seletor de contexto. Fora de `actions.ts`. */

export type ContextoDisponivel = {
  /** `pessoal` ou o id de uma academia. */
  valor: string
  rotulo: string
  detalhe: string | null
  tipo: 'PESSOAL' | 'ACADEMIA'
}

export type TrocaResult =
  | {
      status: 'success'
      destino: string
      /**
       * Para onde o navegador deve ir.
       *
       * Recarregar a rota atual não bastava: quem estava no painel e pedia
       * "conta pessoal" continuava no painel, e o botão parecia não responder.
       * Contexto pessoal vive em `/app`, academia vive em `/dashboard` — a
       * troca de contexto é também uma troca de lugar.
       */
      rota: string
    }
  | { status: 'error'; message: string }

/**
 * Por quanto tempo a escolha dura.
 *
 * Doze horas: cobre um turno de suporte sem a pessoa reescolher a cada
 * navegação, e expira sozinho antes de virar um estado permanente esquecido.
 * Uma conta que lê o banco inteiro não deve ficar "dentro" da academia de um
 * cliente por semanas porque ninguém clicou em voltar.
 */
export const CONTEXTO_MAX_AGE_SEGUNDOS = 12 * 60 * 60
