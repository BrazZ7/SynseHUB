import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` existe para explodir se um módulo de servidor for
      // importado no cliente. Fora do Next não há esse risco, e o pacote
      // quebraria a importação nos testes.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Os testes de banco compartilham um Postgres: rodar em paralelo faria
    // uma suíte apagar os dados da outra no meio da verificação.
    fileParallelism: false,
  },
})
