/**
 * Logger estruturado. Detalhe técnico fica no servidor;
 * o usuário recebe apenas a mensagem humana de `AppError`.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

/** Chaves cujo valor nunca deve aparecer em log. */
const REDACTED = new Set([
  'password',
  'token',
  'apiKey',
  'api_key',
  'access_token',
  'refresh_token',
  'authorization',
  'creditCard',
  'cvv',
  'taxId',
  'cpf',
])

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      REDACTED.has(key) ? '[redacted]' : sanitize(val, depth + 1),
    ]),
  )
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[MIN]) return
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context: sanitize(context) } : {}),
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
}
