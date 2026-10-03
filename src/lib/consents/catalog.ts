import type { ConsentDocument } from '@/types/domain'

/**
 * Cópia dos documentos de consentimento que estão na migration 0017.
 *
 * Existe só para o modo demonstração, que não tem banco. A fonte da verdade é
 * o SQL — e `tests/db/consents.test.ts` compara os dois, para a cópia não
 * envelhecer em silêncio no dia em que um texto ou uma versão mudar.
 */
export const CONSENT_DOCUMENTS: ConsentDocument[] = [
  {
    consentType: 'TERMS_OF_USE',
    version: 'v1',
    title: 'Termos de Uso',
    description: 'Regras de uso do Synse e da sua conta.',
    url: '/termos',
    required: true,
  },
  {
    consentType: 'PRIVACY_POLICY',
    version: 'v1',
    title: 'Política de Privacidade',
    description: 'O que é coletado, por quê, e por quanto tempo fica guardado.',
    url: '/privacidade',
    required: true,
  },
  {
    consentType: 'HEALTH_DATA_PROCESSING',
    version: 'v1',
    title: 'Tratamento de dados de saúde',
    description:
      'Peso, medidas, lesões e restrições — dado sensível pela LGPD. Sem isto, treino e avaliação não funcionam.',
    url: '/privacidade#saude',
    required: false,
  },
  {
    consentType: 'PROGRESS_PHOTOS',
    version: 'v1',
    title: 'Fotos de progresso',
    description:
      'Guardar fotos suas para comparação ao longo do tempo. Só você e quem te treina veem.',
    url: null,
    required: false,
  },
  {
    consentType: 'RANKING_VISIBILITY',
    version: 'v1',
    title: 'Aparecer em rankings',
    description: 'Seu nome e seus números em listas comparativas com outras pessoas.',
    url: null,
    required: false,
  },
  {
    consentType: 'MARKETING_COMMUNICATION',
    version: 'v1',
    title: 'Novidades por e-mail',
    description:
      'Avisos sobre recursos novos e conteúdo do Synse. Nada disso é necessário para treinar.',
    url: null,
    required: false,
  },
]
