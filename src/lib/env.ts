/**
 * Leitura de variável de ambiente tolerante a valor vazio.
 *
 * Plataformas de hospedagem criam variáveis com string vazia ao importar um
 * `.env.example`. `??` não protege contra isso: `'' ?? padrão` devolve `''`.
 * Um `NEXT_PUBLIC_APP_URL` vazio, por exemplo, chegava em `new URL('')` e
 * derrubava a aplicação inteira. Aqui vazio é tratado como ausente.
 */
export function env(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/** Idem para valores numéricos: vazio ou não numérico cai no padrão. */
export function envNumber(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : fallback
}
