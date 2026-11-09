import { describe, expect, it } from 'vitest'

import {
  apenasDigitos,
  cpfValido,
  emailValido,
  formatarCpf,
  janelaDeInscricao,
  telefoneValido,
  vagasRestantes,
} from '@/features/events/state'

/**
 * ── As regras da inscrição, caso a caso ─────────────────────────────────────
 *
 * O banco exige onze dígitos no CPF, e onze dígitos **não é CPF**:
 * `00000000000` passa pelo `check` e `12345678900` também. Num evento pago
 * isso não é detalhe — o CPF é o que impede a mesma pessoa de pegar duas
 * vagas, e é por ele que a academia acha quem pagou quando o PIX cai com
 * outro nome.
 */

describe('cpfValido', () => {
  it('aceita CPF com dígitos verificadores corretos', () => {
    // Gerados pela própria conta oficial, não copiados de documento de ninguém.
    for (const cpf of ['52998224725', '11144477735', '12345678909']) {
      expect(cpfValido(cpf), cpf).toBe(true)
    }
  })

  it('aceita com pontuação, porque é como a pessoa digita', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
  })

  it('recusa quando o dígito verificador não fecha', () => {
    expect(cpfValido('52998224726')).toBe(false)
    expect(cpfValido('12345678900')).toBe(false)
  })

  it('recusa sequência repetida — o caso que todo validador ingênuo deixa passar', () => {
    /*
     * `111.111.111-11` fecha a conta dos dois dígitos verificadores e não
     * existe como CPF. Sem esta regra, onze toques na mesma tecla viram
     * inscrição válida.
     */
    for (let d = 0; d <= 9; d += 1) {
      const repetido = String(d).repeat(11)
      expect(cpfValido(repetido), repetido).toBe(false)
    }
  })

  it('recusa tamanho errado', () => {
    expect(cpfValido('123')).toBe(false)
    expect(cpfValido('529982247251')).toBe(false)
    expect(cpfValido('')).toBe(false)
  })
})

describe('apenasDigitos e formatarCpf', () => {
  it('o que viaja é só dígito', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725')
  })

  it('a máscara é para ler, e não estoura com entrada parcial', () => {
    expect(formatarCpf('529982')).toBe('529.982')
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
    // Mais de onze dígitos é corte, não erro: a pessoa está digitando.
    expect(formatarCpf('529982247259999')).toBe('529.982.247-25')
  })
})

describe('telefoneValido', () => {
  it('aceita fixo com DDD e celular com nono dígito', () => {
    expect(telefoneValido('1133334444')).toBe(true)
    expect(telefoneValido('(11) 99999-0000')).toBe(true)
  })

  it('recusa o que claramente não é telefone', () => {
    expect(telefoneValido('99999')).toBe(false)
    expect(telefoneValido('119999900001111')).toBe(false)
  })
})

describe('emailValido', () => {
  it.each([
    ['sofia@exemplo.com', true],
    ['sofia.gomes+corrida@exemplo.com.br', true],
    ['sofia@exemplo', false],
    ['sofia exemplo.com', false],
    ['@exemplo.com', false],
    ['', false],
  ])('%s → %s', (valor, esperado) => {
    expect(emailValido(valor)).toBe(esperado)
  })
})

describe('janelaDeInscricao', () => {
  const agora = new Date('2026-11-01T12:00:00Z')
  const base = { status: 'PUBLISHED', registrationOpensAt: null, registrationClosesAt: null }

  it('publicado e sem janela está aberto', () => {
    expect(janelaDeInscricao(base, agora)).toEqual({ aberta: true })
  })

  it('rascunho não aceita, e o motivo não é "encerrada"', () => {
    /*
     * Os três motivos existem porque a tela diz coisas diferentes: "ainda não
     * abriu" manda voltar, "encerrada" manda desistir, e "não publicado" não
     * deveria nem ser visto. Trocar um pelo outro faz a pessoa voltar no dia
     * errado.
     */
    expect(janelaDeInscricao({ ...base, status: 'DRAFT' }, agora)).toEqual({
      aberta: false,
      motivo: 'NAO_PUBLICADO',
    })
  })

  it('antes de abrir e depois de fechar têm motivos distintos', () => {
    expect(
      janelaDeInscricao({ ...base, registrationOpensAt: '2026-12-01T00:00:00Z' }, agora),
    ).toEqual({ aberta: false, motivo: 'AINDA_NAO_ABRIU' })

    expect(
      janelaDeInscricao({ ...base, registrationClosesAt: '2026-10-01T00:00:00Z' }, agora),
    ).toEqual({ aberta: false, motivo: 'ENCERRADA' })
  })

  it('o instante do fechamento já está fechado', () => {
    // `>=`, como no SQL: a janela fecha **em** 10h, não 10h e um segundo.
    expect(
      janelaDeInscricao({ ...base, registrationClosesAt: agora.toISOString() }, agora),
    ).toEqual({ aberta: false, motivo: 'ENCERRADA' })
  })
})

describe('vagasRestantes', () => {
  it('sem teto, não há conta a fazer', () => {
    expect(vagasRestantes(null, 500)).toBeNull()
  })

  it('nunca devolve negativo', () => {
    // Lotação estourada por correção manual não vira "-3 vagas" na tela.
    expect(vagasRestantes(10, 13)).toBe(0)
    expect(vagasRestantes(10, 4)).toBe(6)
  })
})
