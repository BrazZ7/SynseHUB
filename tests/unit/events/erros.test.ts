import { describe, expect, it } from 'vitest'

import { mensagemDaInscricao } from '@/features/events/erros'

/**
 * ── A recusa precisa dizer o que aconteceu ──────────────────────────────────
 *
 * Verificado no navegador antes de existir este arquivo: inscrever com um CPF
 * já inscrito mostrava **"Não foi possível concluir esta operação. Tente
 * novamente."** — o pior texto possível, porque convida a tentar de novo uma
 * coisa que nunca vai dar certo.
 *
 * O caminho do erro tem camadas: o data source embrulha o do PostgREST e
 * guarda o original em `cause`. Por isso a busca desce pela corrente.
 */

const comCause = (code: string, message: string) =>
  new Error('supabase query failed: inscreverNoEvento', { cause: { code, message } })

describe('mensagemDaInscricao', () => {
  it('CPF repetido vira recado, não nome de índice', () => {
    /*
     * A mensagem nativa é "duplicate key value violates unique constraint
     * event_registrations_sem_repeticao_idx". Repassar isso seria mostrar o
     * esquema do banco a quem quer correr dez quilômetros.
     */
    const erro = comCause(
      '23505',
      'duplicate key value violates unique constraint "event_registrations_sem_repeticao_idx"',
    )
    const mensagem = mensagemDaInscricao(erro)

    expect(mensagem).toContain('CPF já tem inscrição')
    expect(mensagem).not.toContain('event_registrations')
    expect(mensagem).not.toContain('duplicate')
  })

  it('as recusas de regra chegam como foram escritas', () => {
    // São frases da migration, feitas para esta tela.
    for (const frase of [
      'As inscrições já encerraram.',
      'As inscrições ainda não abriram.',
      'Categoria não é deste evento.',
      'CPF inválido.',
    ]) {
      expect(mensagemDaInscricao(comCause('22023', frase))).toBe(frase)
    }
  })

  it('"não encontrado" também é recado útil', () => {
    expect(mensagemDaInscricao(comCause('P0002', 'Evento não encontrado.'))).toBe(
      'Evento não encontrado.',
    )
  })

  it('erro desconhecido devolve nulo — o genérico assume', () => {
    /*
     * Falha de rede ou de permissão não pode virar frase tranquilizadora
     * sobre inscrição. Quem não sabe o que houve diz que não sabe.
     */
    expect(mensagemDaInscricao(comCause('42501', 'permission denied for table'))).toBeNull()
    expect(mensagemDaInscricao(new Error('ECONNRESET'))).toBeNull()
    expect(mensagemDaInscricao(null)).toBeNull()
    expect(mensagemDaInscricao(undefined)).toBeNull()
  })

  it('mensagem gigante não é repassada', () => {
    // Despejo de erro na tela não é recado.
    const enorme = comCause('22023', 'x'.repeat(500))
    expect(mensagemDaInscricao(enorme)).toBeNull()
  })

  it('o embrulho do data source não é confundido com a mensagem', () => {
    // "supabase query failed: ..." é o invólucro, não o que houve.
    const erro = new Error('supabase query failed: inscreverNoEvento', {
      cause: { code: '22023', message: 'As inscrições já encerraram.' },
    })
    expect(mensagemDaInscricao(erro)).toBe('As inscrições já encerraram.')
  })

  it('erro vindo direto, sem embrulho, também é lido', () => {
    // É a forma da demonstração: ela levanta o erro com o mesmo código.
    const erro = Object.assign(new Error('As inscrições já encerraram.'), { code: '22023' })
    expect(mensagemDaInscricao(erro)).toBe('As inscrições já encerraram.')
  })
})
