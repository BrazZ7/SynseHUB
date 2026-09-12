import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { CURRENCY, LOCALE } from '@/config/app'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    ...options,
  }).format(value)
}

/** Formato compacto para KPIs grandes: R$ 47,8 mil */
export function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(LOCALE, options).format(value)
}

export function formatPercent(value: number, fractionDigits = 1) {
  return `${new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)}%`
}

export function formatDate(value: string | Date | null | undefined, style: 'short' | 'long' = 'short') {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: style === 'long' ? 'long' : '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatPhone(phone: string | null | undefined) {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}

/** Dias inteiros entre duas datas (positivo = `to` no futuro). */
export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const a = typeof from === 'string' ? new Date(from) : from
  const b = typeof to === 'string' ? new Date(to) : to
  const MS_PER_DAY = 86_400_000
  return Math.floor(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      MS_PER_DAY,
  )
}

export function daysOverdue(dueDate: string) {
  return Math.max(0, daysBetween(dueDate))
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Arredonda para 2 casas evitando o erro clássico de ponto flutuante. */
export function toCents(value: number) {
  return Math.round(value * 100)
}

export function fromCents(value: number) {
  return value / 100
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
