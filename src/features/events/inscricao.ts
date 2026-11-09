'use server'

import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { LEGAL } from '@/config/app'
import { mensagemDaInscricao } from '@/features/events/erros'
import {
  apenasDigitos,
  cpfValido,
  emailValido,
  telefoneValido,
  TAMANHOS,
  type InscricaoFormState,
} from '@/features/events/state'
import { headers } from 'next/headers'

/**
 * ── A inscrição pública ─────────────────────────────────────────────────────
 *
 * A primeira escrita do produto feita por quem pode não ter conta nenhuma.
 * Isso muda o que esta action precisa carregar:
 *
 * **Não há sessão para identificar quem chama.** As outras actions começam
 * com `requireHubSession` ou `requireStudentSession`, e é a sessão que diz
 * quem é e o que pode. Aqui não há ninguém — a porta é aberta de propósito,
 * porque a corrida de inauguração existe para trazer gente de fora.
 *
 * O que substitui a sessão:
 *
 * - **O banco valida de novo, e é ele que manda.** `inscrever_no_evento`
 *   confere evento publicado, janela aberta, categoria do evento, CPF e
 *   aceite da política, e conta a vaga sob trava. O que está aqui é para dar
 *   mensagem decente a quem digitou errado, não para autorizar.
 * - **Limite por endereço.** Sem sessão, a chave do limite é o IP do
 *   cabeçalho do proxy. Não é identidade — é o suficiente para um laço não
 *   encher a tabela de CPF inventado enquanto ninguém olha.
 * - **O aceite da política é obrigatório e versionado.** CPF, telefone e
 *   contato de emergência de quem nunca foi cliente, guardados sem base
 *   registrada, é dado sem base. A versão que a pessoa aceitou vai junto.
 *
 * O CPF é validado pelos dígitos verificadores, e não só pelo tamanho: o
 * banco exige onze dígitos, e onze dígitos não é CPF.
 */
export async function inscreverAction(
  _anterior: InscricaoFormState,
  formData: FormData,
): Promise<InscricaoFormState> {
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim()

  const eventId = texto('eventId')
  const fullName = texto('fullName')
  const email = texto('email')
  const phone = texto('phone')
  const taxId = apenasDigitos(texto('taxId'))
  const categoryId = texto('categoryId') || null
  const shirtSize = texto('shirtSize') || null
  const emergencyName = texto('emergencyName') || null
  const emergencyPhone = texto('emergencyPhone') || null
  const aceite = formData.get('privacidade') === 'on'

  const fieldErrors: Record<string, string[]> = {}
  if (fullName.length < 3) fieldErrors.fullName = ['Escreva o nome completo.']
  if (!emailValido(email)) fieldErrors.email = ['E-mail inválido.']
  if (!telefoneValido(phone)) fieldErrors.phone = ['Telefone com DDD, por favor.']
  if (!cpfValido(taxId)) fieldErrors.taxId = ['CPF inválido.']
  if (shirtSize && !TAMANHOS.includes(shirtSize as (typeof TAMANHOS)[number])) {
    fieldErrors.shirtSize = ['Tamanho inválido.']
  }
  if (!aceite) {
    fieldErrors.privacidade = ['É preciso aceitar a política de privacidade para se inscrever.']
  }
  if (!eventId) fieldErrors.eventId = ['Evento não informado.']

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Confira os campos destacados.', fieldErrors }
  }

  try {
    /*
     * Sem sessão, a chave é o endereço. `x-forwarded-for` vem do proxy e é
     * falsificável por quem controla a requisição — por isso ele limita, e
     * não autoriza. Quem autoriza é o banco, e lá a trava é o CPF único por
     * evento.
     */
    const cabecalhos = await headers()
    const endereco =
      cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      cabecalhos.get('x-real-ip') ||
      'desconhecido'

    const limite = await rateLimit(`inscricao:${endereco}`, 10, 60_000)
    if (!limite.allowed) {
      return {
        status: 'error',
        message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
      }
    }

    const dataSource = await getDataSource()
    const inscricao = await dataSource.inscreverNoEvento({
      eventId,
      fullName,
      email,
      phone,
      taxId,
      privacyVersion: LEGAL.version,
      categoryId,
      shirtSize,
      emergencyName,
      emergencyPhone,
    })

    return { status: 'success', codigo: inscricao.confirmationCode }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('eventos:inscricao_falhou', { error: String(error) })
    }

    /*
     * As recusas de regra do banco são frases escritas para esta tela, e
     * `toUserMessage` as trocaria pelo genérico — que, no caso do CPF
     * repetido, convida a pessoa a tentar de novo uma coisa que nunca vai
     * dar certo. Verificado no navegador antes de existir este trecho.
     */
    const doDominio = mensagemDaInscricao(error)
    if (doDominio) {
      const cpfRepetido = doDominio.includes('CPF já tem inscrição')
      return {
        status: 'error',
        message: doDominio,
        ...(cpfRepetido ? { fieldErrors: { taxId: [doDominio] } } : {}),
      }
    }

    return { status: 'error', message: toUserMessage(error) }
  }
}
