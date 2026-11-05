/**
 * Synse ID — identificador público e vitalício do usuário.
 *
 * Formato: SYN-XXXXXXXX (Crockford base32, sem I/L/O/U para evitar ambiguidade).
 * Deliberadamente NÃO sequencial: um ID não permite inferir outro, nem estimar
 * o tamanho da base. O identificador interno continua sendo o UUID.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LENGTH = 8

export const SYNSE_ID_PATTERN = /^SYN-[0-9A-HJKMNP-TV-Z]{8}$/

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function generateSynseId(): string {
  const bytes = randomBytes(LENGTH)
  let out = ''
  for (let i = 0; i < LENGTH; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `SYN-${out}`
}

export function isValidSynseId(value: string): boolean {
  return SYNSE_ID_PATTERN.test(value)
}
