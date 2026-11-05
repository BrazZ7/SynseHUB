import type { WorkoutSession } from '@/features/active-workout/engine/types'

/**
 * De quem é o treino gravado no aparelho.
 *
 * Até existir este arquivo, não era de ninguém: a sessão morava numa chave
 * fixa (`atual`) de um banco fixo (`synse-workout`), e a fila de envio era uma
 * lista só. Num aparelho compartilhado — o celular do casal, o tablet da
 * recepção, o aluno que entra na conta do amigo para mostrar o app — quem
 * abria depois recuperava o treino de quem abriu antes: nome do plano,
 * exercícios, cargas, séries. E a fila pendente subia pela sessão de quem
 * estava logado **naquele momento**, de modo que as séries de uma pessoa
 * entravam no histórico da outra.
 *
 * As regras ficam aqui, puras e sem IndexedDB, por dois motivos. O primeiro é
 * teste: `fake-indexeddb` não está no projeto, e a regra que impede o
 * vazamento é justamente a que não pode depender de ambiente para ser
 * verificada. O segundo é camada: o engine não sabe o que é uma conta, e não
 * deveria — quem guarda o dono é o armazenamento, não o domínio do treino.
 *
 * O dono é o `studentId`: é a matrícula que o banco resolve pelo `auth.uid()`
 * ao abrir a sessão (`start_workout_session`), então é por ela que o dado local
 * precisa ser separado. A mesma pessoa matriculada em duas academias tem dois
 * escopos, e isso é o comportamento certo: treino aberto como aluna de uma não
 * pode ser enviado em nome da matrícula da outra.
 */

/** O registro como ele vai para o IndexedDB: o treino, e de quem ele é. */
export type RegistroDeSessao = {
  dono: string
  sessao: WorkoutSession
}

/** Qualquer operação da fila carrega o dono. */
type ComDono = { dono: string }

/**
 * Dono vazio não é escopo.
 *
 * `''` como chave gravaria todo mundo no mesmo lugar outra vez, e em silêncio.
 * Melhor não gravar: a tela segue em memória, que é o que ela já faz quando o
 * IndexedDB não existe.
 */
export function donoValido(dono: string | null | undefined): dono is string {
  return typeof dono === 'string' && dono.trim().length > 0
}

/** A chave da sessão no IndexedDB. Uma por dono, e nenhuma compartilhada. */
export function chaveDaSessao(dono: string): string {
  return `sessao:${dono}`
}

/**
 * O treino guardado, se for de quem está perguntando.
 *
 * A chave já separa; esta conferência é a segunda tranca. Chave montada errada,
 * registro copiado de um aparelho para outro, migração futura que erre o
 * formato — em qualquer um desses casos o vazamento volta, e aqui ele para.
 */
export function sessaoDoDono(
  registro: RegistroDeSessao | null | undefined,
  dono: string,
): WorkoutSession | null {
  if (!registro || !donoValido(dono)) return null
  if (registro.dono !== dono) return null
  return registro.sessao ?? null
}

/**
 * A parte da fila que é desta pessoa.
 *
 * A fila é uma loja só porque o `clientId` é único no mundo e o reenvio precisa
 * poder apagar por ele. A separação é na leitura: quem sincroniza só vê — e só
 * conta como pendente — o que é seu. O que é de outro dono fica no aparelho,
 * intocado, esperando a volta de quem o gravou.
 */
export function filaDoDono<T extends ComDono>(fila: T[], dono: string): T[] {
  if (!donoValido(dono)) return []
  return fila.filter((operacao) => operacao.dono === dono)
}
