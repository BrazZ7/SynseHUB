/**
 * A organização reservada do Synse (migration 0013).
 *
 * É onde ficam as matrículas de quem treina sem academia vinculada. Não tem
 * equipe — e como toda a RLS de leitura de aluno passa por `is_org_staff`, é
 * isso que impede um solo de enxergar o outro.
 *
 * O id é fixo e conhecido dos dois lados: o banco insere a linha na migration,
 * a aplicação a reconhece aqui. Guardá-lo em variável de ambiente só criaria
 * uma forma nova de os dois discordarem.
 */
export const SYNSE_SOLO_ORG_ID = '00000000-0000-0000-0000-000000000001'

export function isSoloOrganization(organizationId: string | null | undefined): boolean {
  return organizationId === SYNSE_SOLO_ORG_ID
}

/** Como o app chama o lugar onde a pessoa treina, quando não há academia. */
export const SOLO_ORGANIZATION_LABEL = 'Por conta própria'
