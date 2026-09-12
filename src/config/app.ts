import { env } from '@/lib/env'

/**
 * Configuração central do ecossistema Synse.
 * Nada aqui pode conter segredo — apenas metadados públicos e defaults.
 */

export const APP = {
  name: 'SynseHub',
  ecosystem: 'Synse',
  version: '0.1.0',
  tagline: 'Saúde em equilíbrio com o seu futuro',
  url: env(process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000'),
  /*
   * Sem `NEXT_PUBLIC_SYNSE_ENV` declarado, o ambiente vem do build. Antes o
   * padrão era sempre 'development', então um deploy de produção se dizia
   * desenvolvimento e a página ficava marcada como não indexável.
   */
  env: env(
    process.env.NEXT_PUBLIC_SYNSE_ENV,
    process.env.NODE_ENV === 'production' ? 'production' : 'development',
  ) as 'development' | 'staging' | 'production',
} as const

/** Produtos do ecossistema. Servem de namespace para features e permissões. */
export const SYNSE_PRODUCTS = {
  HUB: 'synse-hub',
  APP: 'synse-app',
  PAY: 'synse-pay',
  PLUS: 'synse-plus',
  PRO: 'synse-pro',
  MARKET: 'synse-market',
  AI: 'synse-ai',
  CORPORATE: 'synse-corporate',
} as const

export type SynseProduct = (typeof SYNSE_PRODUCTS)[keyof typeof SYNSE_PRODUCTS]

export const BRAND = {
  logo: env(process.env.NEXT_PUBLIC_BRAND_LOGO, '/brand/synse-logo.svg'),
  symbol: env(process.env.NEXT_PUBLIC_BRAND_SYMBOL, '/brand/synse-symbol.svg'),
} as const

/**
 * Identificação de quem responde pelos documentos legais.
 *
 * Fica em variável de ambiente, e não escrita no código, por uma razão simples:
 * enquanto a empresa não estiver constituída não existe CNPJ, e inventar um
 * número numa política de privacidade é pior do que não ter a página. Sem
 * valor preenchido, o documento diz que a identificação está em andamento e
 * oferece o contato — que é o que a LGPD pede que exista de fato.
 */
export const LEGAL = {
  entity: env(process.env.NEXT_PUBLIC_LEGAL_ENTITY, ''),
  taxId: env(process.env.NEXT_PUBLIC_LEGAL_TAX_ID, ''),
  address: env(process.env.NEXT_PUBLIC_LEGAL_ADDRESS, ''),
  contactEmail: env(process.env.NEXT_PUBLIC_LEGAL_CONTACT, 'privacidade@synse.com.br'),
  /** Precisa bater com a versão em `consent_documents` (migration 0017). */
  version: 'v1',
  updatedAt: '2026-09-12',
} as const

export const LOCALE = 'pt-BR'
export const CURRENCY = 'BRL'
export const TIMEZONE = 'America/Sao_Paulo'
