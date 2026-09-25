import { describe, expect, it } from 'vitest'

import {
  lerAssinatura,
  resumoDaAssinatura,
  SEM_ASSINATURA,
  type PlusSubscription,
} from '@/lib/plans/subscription'

const DIA = 86_400_000
const AGORA = new Date('2026-09-23T12:00:00Z')
const daquiA = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString()

describe('lerAssinatura', () => {
  it('lê o que a 0036 grava', () => {
    expect(lerAssinatura({ plus_status: 'TRIAL', plus_until: daquiA(18) })).toEqual({
      status: 'TRIAL',
      until: daquiA(18),
    })
  })

  it('devolve "sem assinatura" quando a coluna ainda não existe', () => {
    /*
     * Publicar não é migrar: entre o deploy e o SQL colado à mão, `plus_status`
     * não existe. A leitura precisa devolver o estado neutro em vez de quebrar
     * — e nunca o contrário, que liberaria acesso por omissão.
     */
    expect(lerAssinatura({})).toEqual(SEM_ASSINATURA)
    expect(lerAssinatura({ plus_status: null })).toEqual(SEM_ASSINATURA)
  })

  it('não confia em estado que não conhece', () => {
    // Valor inventado no banco não pode virar acesso liberado.
    expect(lerAssinatura({ plus_status: 'VITALICIO', plus_until: daquiA(3650) })).toEqual(
      SEM_ASSINATURA,
    )
  })
})

describe('resumoDaAssinatura', () => {
  const resumo = (status: PlusSubscription['status'], until: string | null) =>
    resumoDaAssinatura({ status, until }, AGORA)

  it('o teste grátis libera o acesso e conta os dias', () => {
    const r = resumo('TRIAL', daquiA(18))
    expect(r).toMatchObject({ ativa: true, emTeste: true, encerrando: false, diasRestantes: 18 })
    expect(r.proximaCobranca?.toISOString()).toBe(daquiA(18))
  })

  it('arredonda o dia para cima', () => {
    // Faltando 18 horas, quem lê quer ver "1 dia" — "0 dias" seria lido como
    // "acabou", num aviso que existe justamente para avisar antes.
    expect(resumo('TRIAL', new Date(AGORA.getTime() + 18 * 3_600_000).toISOString())
      .diasRestantes).toBe(1)
  })

  it('a assinatura ativa renova, e não está em teste', () => {
    const r = resumo('ACTIVE', daquiA(30))
    expect(r).toMatchObject({ ativa: true, emTeste: false })
    expect(r.proximaCobranca).not.toBeNull()
  })

  it('quem cancelou continua com acesso, mas sem próxima cobrança', () => {
    // É o que os Termos prometem: cancelar interrompe a renovação seguinte,
    // não o período em curso.
    const r = resumo('CANCELED', daquiA(9))
    expect(r).toMatchObject({ ativa: true, encerrando: true, diasRestantes: 9 })
    expect(r.proximaCobranca).toBeNull()
  })

  it('a data manda, mesmo com o estado dizendo outra coisa', () => {
    /*
     * O `tier` no banco envelhece: uma conta cujo ciclo venceu ontem continua
     * PRO até a rotina de expiração rodar. Aqui a data decide, porque é a
     * única informação que não depende de ninguém ter rodado nada.
     */
    expect(resumo('ACTIVE', daquiA(-1)).ativa).toBe(false)
    expect(resumo('TRIAL', daquiA(-1)).emTeste).toBe(false)
    expect(resumo('CANCELED', daquiA(-1)).encerrando).toBe(false)
  })

  it('sem assinatura, nada está ativo', () => {
    expect(resumo('NONE', null)).toMatchObject({
      ativa: false,
      emTeste: false,
      diasRestantes: null,
      proximaCobranca: null,
    })
    expect(resumo('EXPIRED', null).ativa).toBe(false)
  })

  it('estado com prazo e data inválida não libera acesso', () => {
    // A 0036 recusa isso na escrita; aqui a leitura não pode confiar nisso.
    expect(resumoDaAssinatura({ status: 'ACTIVE', until: 'nao-e-data' }, AGORA)).toMatchObject({
      ativa: false,
      diasRestantes: null,
    })
    expect(resumoDaAssinatura({ status: 'ACTIVE', until: null }, AGORA).ativa).toBe(false)
  })
})
