/**
 * Configuração central do ecossistema Synse.
 * Nada aqui pode conter segredo — apenas metadados públicos e defaults.
 */

export const APP = {
  name: 'SynseHub',
  ecosystem: 'Synse',
  version: '0.1.0',
  tagline: 'Saúde em equilíbrio com o seu futuro',
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  env: (process.env.NEXT_PUBLIC_SYNSE_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
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
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/brand/synse-logo.svg',
  symbol: process.env.NEXT_PUBLIC_BRAND_SYMBOL ?? '/brand/synse-symbol.svg',
} as const

export const LOCALE = 'pt-BR'
export const CURRENCY = 'BRL'
export const TIMEZONE = 'America/Sao_Paulo'
